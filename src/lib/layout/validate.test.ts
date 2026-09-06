import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ModuleDefinition } from "@/lib/layout/types";

// The catalog is owned by the resolver work; validation only needs a handful
// of definitions with known capabilities, so it is mocked here.
const FAKE_CATALOG: ModuleDefinition[] = [
  {
    id: "sites.uptime",
    title: "Uptime",
    ownerView: "sites",
    allowedViews: ["canvas", "sites", "wall"],
    defaultWidth: "standard",
    allowedWidths: ["standard", "wide"],
    defaultSize: { w: 4, h: 13 },
    minSize: { w: 3, h: 5 },
    defaultDensity: "standard",
    allowedDensities: ["summary", "standard"],
    sensitivity: "normal",
    dataMode: "shared",
  },
  {
    id: "money.bank",
    title: "Bank",
    ownerView: "money",
    allowedViews: ["canvas", "money", "wall"],
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard"],
    defaultSize: { w: 3, h: 13 },
    minSize: { w: 3, h: 5 },
    defaultDensity: "standard",
    allowedDensities: ["standard"],
    sensitivity: "private",
    dataMode: "self-fetch",
  },
  {
    // Private and never allowed on the wall, like every real private module.
    id: "dev.files",
    title: "Files",
    ownerView: "dev",
    allowedViews: ["canvas", "dev"],
    defaultWidth: "wide",
    allowedWidths: ["wide"],
    defaultSize: { w: 3, h: 13 },
    minSize: { w: 3, h: 5 },
    defaultDensity: "standard",
    allowedDensities: ["standard"],
    sensitivity: "private",
    dataMode: "self-fetch",
  },
  {
    id: "alerts.queue",
    title: "Attention queue",
    ownerView: "alerts",
    allowedViews: ["canvas", "alerts"],
    defaultWidth: "full",
    allowedWidths: ["full"],
    defaultSize: { w: 8, h: 6 },
    minSize: { w: 6, h: 4 },
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
    const raw = { schemaVersion: 1, views: { canvas: { order: Array(9000).fill("sites.uptime") } } };
    expectError(raw, /64 KB/);
  });

  it("rejects structurally wrong types", () => {
    expectError({ schemaVersion: 1, views: [] }, /views must be an object/);
    expectError({ schemaVersion: 1, views: { canvas: { order: "sites.uptime" } } }, /order must be an array/);
    expectError({ schemaVersion: 1, views: { canvas: { order: [1, 2] } } }, /order must be an array/);
    expectError({ schemaVersion: 1, views: { canvas: { modules: [] } } }, /modules must be an object/);
    expectError({ schemaVersion: 1, views: { canvas: { modules: { "sites.uptime": { enabled: "no" } } } } }, /enabled must be a boolean/);
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
        canvas: {
          order: ["sites.uptime", "gone.module", "money.bank", "sites.uptime"],
          modules: { "gone.module": { enabled: false }, "money.bank": { width: "compact" } },
        },
        nowhere: { order: ["sites.uptime"] },
      },
      // Navigation is gone, so a stale domains block is dropped, not rejected.
      domains: { nowhere: { visible: false } },
    });
    expect(result).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        revision: 0,
        views: {
          canvas: {
            order: ["sites.uptime", "money.bank"],
            modules: { "money.bank": { width: "compact" } },
          },
        },
      },
    });
  });

  it("rejects a width the module does not support", () => {
    expectError(
      { schemaVersion: 1, views: { canvas: { modules: { "sites.uptime": { width: "full" } } } } },
      /width "full" is not supported/
    );
    expectError(
      { schemaVersion: 1, views: { canvas: { modules: { "sites.uptime": { width: "huge" } } } } },
      /width must be one of/
    );
  });

  it("rejects a density the module does not support", () => {
    expectError(
      { schemaVersion: 1, views: { canvas: { modules: { "sites.uptime": { density: "full" } } } } },
      /density "full" is not supported/
    );
  });

  it("refuses to enable a private module on the wallboard", () => {
    expectError(
      { schemaVersion: 1, views: { wall: { modules: { "money.bank": { enabled: true } } } } },
      /may not appear on the wallboard/
    );
    // The same module is fine in its owner view.
    const ok = validateProfile({ schemaVersion: 1, views: { canvas: { modules: { "money.bank": { enabled: true } } } } });
    expect(ok.ok).toBe(true);
  });

  it("refuses a private module on the wallboard even when the wall is not among its views", () => {
    expectError(
      { schemaVersion: 1, views: { wall: { modules: { "dev.files": { enabled: true } } } } },
      /private modules may not appear on the wallboard/
    );
    // Hiding it there is harmless and just dropped, like any out-of-view id.
    const hidden = validateProfile({ schemaVersion: 1, views: { wall: { modules: { "dev.files": { enabled: false } } } } });
    expect(hidden.ok && hidden.profile.views).toBeUndefined();
  });

  it("refuses to disable a required module", () => {
    expectError(
      { schemaVersion: 1, views: { canvas: { modules: { "alerts.queue": { enabled: false } } } } },
      /required and cannot be hidden/
    );
  });


  it("keeps a valid override set intact", () => {
    const result = validateProfile({
      schemaVersion: 1,
      revision: 2,
      views: {
        canvas: { order: ["sites.uptime"], modules: { "sites.uptime": { width: "wide", density: "summary" } } },
      },
    });
    expect(result).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        revision: 2,
        views: {
        canvas: { order: ["sites.uptime"], modules: { "sites.uptime": { width: "wide", density: "summary" } } },
        },
      },
    });
  });
});

describe("validateProfile rectangles", () => {
  const rect = (raw: unknown) => ({
    schemaVersion: 1,
    views: { canvas: { modules: { "sites.uptime": { rect: raw } } } },
  });

  it("keeps a rectangle that fits the plane and the module's minimum", () => {
    const result = validateProfile(rect({ x: 4, y: 9, w: 6, h: 11 }));
    expect(result).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        revision: 0,
        views: { canvas: { modules: { "sites.uptime": { rect: { x: 4, y: 9, w: 6, h: 11 } } } } },
      },
    });
  });

  it("rejects a rectangle that is not four non-negative integers", () => {
    expectError(rect({ x: 0, y: 0, w: 6 }), /rect\.h must be a non-negative integer/);
    expectError(rect({ x: -1, y: 0, w: 6, h: 6 }), /rect\.x must be a non-negative integer/);
    expectError(rect({ x: 0, y: 0, w: 6.5, h: 6 }), /rect\.w must be a non-negative integer/);
    expectError(rect("middle"), /rect must be an object/);
  });

  it("rejects a rectangle that runs off the plane", () => {
    expectError(rect({ x: 30, y: 0, w: 6, h: 6 }), /past the right edge/);
    expectError(rect({ x: 0, y: 399, w: 6, h: 6 }), /past the bottom/);
  });

  it("rejects a rectangle smaller than the module's own minimum", () => {
    expectError(rect({ x: 0, y: 0, w: 1, h: 6 }), /smaller than this module's minimum/);
    expectError(rect({ x: 0, y: 0, w: 6, h: 1 }), /smaller than this module's minimum/);
  });

  it("drops a rectangle aimed at the wallboard, which does not arrange by hand", () => {
    const result = validateProfile({
      schemaVersion: 1,
      views: { wall: { modules: { "sites.uptime": { rect: { x: 0, y: 0, w: 6, h: 6 }, density: "summary" } } } },
    });
    expect(result).toEqual({
      ok: true,
      profile: {
        schemaVersion: 1,
        revision: 0,
        views: { wall: { modules: { "sites.uptime": { density: "summary" } } } },
      },
    });
  });
});
