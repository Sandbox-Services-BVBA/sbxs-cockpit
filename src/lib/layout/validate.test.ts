import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ModuleDefinition } from "@/lib/layout/types";

// The catalog is owned by the resolver work; validation only needs a handful
// of definitions with known capabilities, so it is mocked here.
const FAKE_CATALOG: ModuleDefinition[] = [
  {
    id: "sites.uptime",
    title: "Uptime",
    ownerView: "sites",
    allowedViews: ["sites", "wall"],
    defaultWidth: "standard",
    allowedWidths: ["standard", "wide"],
    defaultDensity: "standard",
    allowedDensities: ["summary", "standard"],
    sensitivity: "normal",
    dataMode: "shared",
  },
  {
    id: "money.bank",
    title: "Bank",
    ownerView: "money",
    allowedViews: ["money", "wall"],
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard"],
    defaultDensity: "standard",
    allowedDensities: ["standard"],
    sensitivity: "private",
    dataMode: "self-fetch",
  },
  {
    id: "alerts.queue",
    title: "Attention queue",
    ownerView: "alerts",
    allowedViews: ["alerts"],
    defaultWidth: "full",
    allowedWidths: ["full"],
    defaultDensity: "full",
    allowedDensities: ["summary", "full"],
    sensitivity: "normal",
    dataMode: "shared",
    required: true,
  },
];

vi.mock("@/lib/layout/catalog", () => {
  const byId = Object.fromEntries(FAKE_CATALOG.map((m) => [m.id, m]));
  return {
    MODULE_CATALOG: FAKE_CATALOG,
    MODULE_BY_ID: byId,
    getModule: (id: string) => byId[id],
  };
});

let validateProfile: typeof import("@/lib/layout/validate").validateProfile;

beforeAll(async () => {
  ({ validateProfile } = await import("@/lib/layout/validate"));
});

function expectError(raw: unknown, pattern: RegExp) {
  const result = validateProfile(raw);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(pattern);
}

describe("validateProfile shape", () => {
  it("rejects non-objects", () => {
    expectError(null, /object/);
    expectError([], /object/);
    expectError("x", /object/);
  });

  it("rejects a missing or newer schemaVersion", () => {
    expectError({}, /schemaVersion/);
    expectError({ schemaVersion: "1" }, /schemaVersion/);
    expectError({ schemaVersion: 999 }, /newer/);
  });

  it("rejects an oversized payload", () => {
    const raw = { schemaVersion: 1, views: { sites: { order: Array(9000).fill("sites.uptime") } } };
    expectError(raw, /64 KB/);
  });

  it("rejects structurally wrong types", () => {
    expectError({ schemaVersion: 1, views: [] }, /views must be an object/);
    expectError({ schemaVersion: 1, views: { sites: { order: "sites.uptime" } } }, /order must be an array/);
    expectError({ schemaVersion: 1, views: { sites: { order: [1, 2] } } }, /order must be an array/);
    expectError({ schemaVersion: 1, views: { sites: { modules: [] } } }, /modules must be an object/);
    expectError({ schemaVersion: 1, views: { sites: { modules: { "sites.uptime": { enabled: "no" } } } } }, /enabled must be a boolean/);
    expectError({ schemaVersion: 1, domains: { sites: { visible: 1 } } }, /visible must be a boolean/);
  });

  it("accepts an empty profile and returns only overrides", () => {
    const result = validateProfile({ schemaVersion: 1, revision: 3, junk: true });
    expect(result).toEqual({ ok: true, profile: { schemaVersion: 1, revision: 3 } });
  });
});

describe("validateProfile catalog rules", () => {
  it("drops unknown module ids, unknown views and ids not allowed in the view", () => {
    const result = validateProfile({
      schemaVersion: 1,
      views: {
        sites: {
          order: ["sites.uptime", "gone.module", "money.bank", "sites.uptime"],
          modules: { "gone.module": { enabled: false }, "money.bank": { width: "compact" } },
        },
        nowhere: { order: ["sites.uptime"] },
      },
      domains: { nowhere: { visible: false } },
    });
    expect(result).toEqual({
      ok: true,
      profile: { schemaVersion: 1, revision: 0, views: { sites: { order: ["sites.uptime"] } } },
    });
  });

  it("rejects a width the module does not support", () => {
    expectError(
      { schemaVersion: 1, views: { sites: { modules: { "sites.uptime": { width: "full" } } } } },
      /width "full" is not supported/
    );
    expectError(
      { schemaVersion: 1, views: { sites: { modules: { "sites.uptime": { width: "huge" } } } } },
      /width must be one of/
    );
  });

  it("rejects a density the module does not support", () => {
    expectError(
      { schemaVersion: 1, views: { sites: { modules: { "sites.uptime": { density: "full" } } } } },
      /density "full" is not supported/
    );
  });

  it("refuses to enable a private module on the wallboard", () => {
    expectError(
      { schemaVersion: 1, views: { wall: { modules: { "money.bank": { enabled: true } } } } },
      /may not appear on the wallboard/
    );
    // The same module is fine in its owner view.
    const ok = validateProfile({ schemaVersion: 1, views: { money: { modules: { "money.bank": { enabled: true } } } } });
    expect(ok.ok).toBe(true);
  });

  it("refuses to disable a required module", () => {
    expectError(
      { schemaVersion: 1, views: { alerts: { modules: { "alerts.queue": { enabled: false } } } } },
      /required and cannot be hidden/
    );
  });

  it("requires exactly four mobile pins when any pin is specified", () => {
    expectError({ schemaVersion: 1, domains: { sites: { mobilePinned: true } } }, /exactly 4/);
    const ok = validateProfile({
      schemaVersion: 1,
      domains: {
        house: { mobilePinned: true },
        sites: { mobilePinned: true },
        money: { mobilePinned: true },
        dev: { mobilePinned: true },
        infra: { mobilePinned: false },
      },
    });
    expect(ok.ok).toBe(true);
  });

  it("keeps a valid override set intact", () => {
    const result = validateProfile({
      schemaVersion: 1,
      revision: 2,
      domains: { personal: { visible: false, order: 8 } },
      views: {
        sites: { order: ["sites.uptime"], modules: { "sites.uptime": { width: "wide", density: "summary" } } },
      },
    });
    expect(result).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        revision: 2,
        domains: { personal: { visible: false, order: 8 } },
        views: {
          sites: { order: ["sites.uptime"], modules: { "sites.uptime": { width: "wide", density: "summary" } } },
        },
      },
    });
  });
});
