import { describe, expect, it } from "vitest";
import { MODULE_CATALOG } from "./catalog";
import { DEFAULT_DOMAIN_ORDER, DEFAULT_LAYOUTS, DEFAULT_MOBILE_PINS } from "./default-layouts";
import { normalizeProfile, resolveLayout, resolveView } from "./resolver";
import { LAYOUT_SCHEMA_VERSION, MOBILE_PIN_COUNT, type LayoutProfile } from "./types";

function profile(partial: Partial<LayoutProfile>): LayoutProfile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 1, ...partial };
}

const ids = (view: ReturnType<typeof resolveView>) => view.modules.map((m) => m.moduleId);

describe("resolveView with no profile", () => {
  it("follows the default placement for every view", () => {
    for (const viewId of DEFAULT_DOMAIN_ORDER) {
      const view = resolveView(viewId, null);
      const expected = DEFAULT_LAYOUTS[viewId].map((p) => p.moduleId);
      expect([...ids(view), ...view.hidden.map((m) => m.moduleId)]).toEqual(expected);
      for (const entry of view.modules) {
        const placement = DEFAULT_LAYOUTS[viewId].find((p) => p.moduleId === entry.moduleId)!;
        expect(entry.width).toBe(placement.width ?? entry.definition.defaultWidth);
        expect(entry.density).toBe(placement.density ?? entry.definition.defaultDensity);
        expect(entry.enabled).toBe(true);
      }
    }
  });

  it("reproduces today's Client sites row: uptime wide, the rest standard", () => {
    const view = resolveView("sites", null);
    expect(ids(view)).toEqual(["uptime-grid", "cityscreens", "domains", "umami-plaq", "umami-byb"]);
    expect(view.modules.map((m) => m.width)).toEqual(["wide", "standard", "standard", "standard", "standard"]);
  });
});

describe("resolveView with overrides", () => {
  it("honours a saved order and appends modules the profile never saw", () => {
    const view = resolveView("sites", profile({
      views: { sites: { order: ["domains", "uptime-grid"] } },
    }));
    expect(ids(view)).toEqual(["domains", "uptime-grid", "cityscreens", "umami-plaq", "umami-byb"]);
  });

  it("drops order ids that are unknown, from another view, or duplicated", () => {
    const view = resolveView("money", profile({
      views: { money: { order: ["bank", "ghost-module", "servers", "bank", "unbilled", "unbilled"] } },
    }));
    expect(ids(view)).toEqual(["bank", "unbilled", "timeentries"]);
  });

  it("keeps an old profile working when a module has been removed from code", () => {
    const view = resolveView("dev", profile({
      views: {
        dev: {
          order: ["sobriety", "agents", "projects"],
          modules: { sobriety: { enabled: false, width: "full" } },
        },
      },
    }));
    expect(ids(view)).toEqual(["agents", "projects", "file-activity", "ai-usage", "file-explorer"]);
    expect(ids(view)).not.toContain("sobriety");
  });

  it("applies enabled, width and density overrides", () => {
    const view = resolveView("infra", profile({
      views: {
        infra: {
          modules: {
            crons: { width: "full", density: "summary" },
            gpu: { enabled: false },
          },
        },
      },
    }));
    const crons = view.modules.find((m) => m.moduleId === "crons")!;
    expect(crons.width).toBe("full");
    expect(crons.density).toBe("summary");
    expect(ids(view)).not.toContain("gpu");
    expect(view.hidden.map((m) => m.moduleId)).toEqual(["gpu"]);
  });

  it("falls back to the default when a width or density is not allowed", () => {
    const view = resolveView("sites", profile({
      views: {
        sites: {
          modules: {
            "umami-plaq": { width: "full", density: "summary" },
            "uptime-grid": { width: "compact" },
          },
        },
      },
    }));
    const plaq = view.modules.find((m) => m.moduleId === "umami-plaq")!;
    expect(plaq.width).toBe("standard");
    expect(plaq.density).toBe("standard");
    expect(view.modules.find((m) => m.moduleId === "uptime-grid")!.width).toBe("wide");
  });

  it("never lets a required module be disabled", () => {
    const view = resolveView("alerts", profile({
      views: { alerts: { order: [], modules: { "alerts-summary": { enabled: false } } } },
    }));
    expect(ids(view)).toEqual(["alerts-summary"]);
    expect(view.hidden).toEqual([]);
  });

  it("never outputs a module id that is not in the catalog", () => {
    const known = new Set(MODULE_CATALOG.map((m) => m.id));
    const layout = resolveLayout(profile({
      views: Object.fromEntries(
        DEFAULT_DOMAIN_ORDER.map((id) => [id, { order: ["nope", "bank", "weight"], modules: { nope: {} } }])
      ),
    }));
    for (const view of Object.values(layout.views)) {
      for (const entry of [...view.modules, ...view.hidden]) {
        expect(known.has(entry.moduleId)).toBe(true);
        expect(entry.definition.allowedViews).toContain(view.viewId);
      }
    }
  });
});

describe("wallboard privacy", () => {
  it("places, by default, exactly the old hard-coded allow-list in registry order", () => {
    expect(ids(resolveView("wall", null))).toEqual([
      "uptime-grid",
      "servers",
      "gpu",
      "thermals",
      "backups",
      "connections",
      "cityscreens",
      "domains",
      "crons",
      "services",
      "inbox",
      "mailroom",
    ]);
  });

  it("shows only normal-sensitivity modules by default", () => {
    const view = resolveView("wall", null);
    expect(view.modules.length).toBeGreaterThan(0);
    for (const entry of [...view.modules, ...view.hidden]) {
      expect(entry.definition.sensitivity, entry.moduleId).toBe("normal");
    }
  });

  it("refuses private and control modules however the profile asks", () => {
    const view = resolveView("wall", profile({
      views: {
        wall: {
          order: ["bank", "weight", "btc", "file-explorer", "file-activity", "home-control", "servers"],
          modules: {
            bank: { enabled: true },
            "home-control": { enabled: true, width: "wide" },
            "file-activity": { enabled: true },
          },
        },
      },
    }));
    const all = [...view.modules, ...view.hidden].map((m) => m.moduleId);
    for (const id of ["bank", "weight", "btc", "file-explorer", "file-activity", "home-control"]) {
      expect(all).not.toContain(id);
    }
    expect(ids(view)[0]).toBe("servers");
  });

  it("lets a profile reorder, hide and set density on what the wall may show", () => {
    const view = resolveView("wall", profile({
      views: {
        wall: {
          order: ["crons", "uptime-grid"],
          modules: { crons: { density: "summary" }, "uptime-grid": { enabled: false } },
        },
      },
    }));
    expect(ids(view)[0]).toBe("crons");
    expect(view.modules[0].density).toBe("summary");
    expect(view.hidden.map((m) => m.moduleId)).toEqual(["uptime-grid"]);
  });
});

describe("attention safety", () => {
  it("keeps the alert queue placed whatever the profile says, with density as the only choice", () => {
    const view = resolveView("alerts", profile({
      views: { alerts: { modules: { "alerts-summary": { enabled: false, density: "summary", width: "compact" } } } },
    }));
    expect(ids(view)).toEqual(["alerts-summary"]);
    expect(view.hidden).toEqual([]);
    expect(view.modules[0].density).toBe("summary");
    // compact is not an allowed width for the queue, so the default holds.
    expect(view.modules[0].width).toBe("full");
  });
});

describe("resolveLayout domains", () => {
  it("returns the default navigation and pins with no profile", () => {
    const layout = resolveLayout(null);
    expect(layout.domains.map((d) => d.viewId)).toEqual(DEFAULT_DOMAIN_ORDER);
    expect(layout.mobilePins).toEqual(DEFAULT_MOBILE_PINS);
    expect(layout.domains.filter((d) => d.mobilePinned).map((d) => d.viewId)).toEqual(DEFAULT_MOBILE_PINS);
    expect(Object.keys(layout.views).sort()).toEqual([...DEFAULT_DOMAIN_ORDER].sort());
  });

  it("orders saved domains and leaves the rest in default order", () => {
    const layout = resolveLayout(profile({
      domains: { dev: { order: -1 }, wall: { order: 0.5 } },
    }));
    const order = layout.domains.map((d) => d.viewId);
    expect(order[0]).toBe("dev");
    expect(order[1]).toBe("house");
    expect(order[2]).toBe("wall");
    expect(order.slice(3)).toEqual(DEFAULT_DOMAIN_ORDER.filter((id) => !["dev", "house", "wall"].includes(id)));
  });

  it("drops hidden domains from navigation but still resolves their views", () => {
    const layout = resolveLayout(profile({ domains: { personal: { visible: false } } }));
    expect(layout.domains.map((d) => d.viewId)).not.toContain("personal");
    expect(layout.views.personal.modules.length).toBeGreaterThan(0);
  });
});

describe("resolveLayout mobile pins", () => {
  it("honours saved pins in navigation order", () => {
    const layout = resolveLayout(profile({
      domains: {
        money: { mobilePinned: true },
        comms: { mobilePinned: true },
        dev: { mobilePinned: true },
        wall: { mobilePinned: true },
        house: { mobilePinned: false },
      },
    }));
    expect(layout.mobilePins).toEqual(["money", "comms", "dev", "wall"]);
  });

  it("tops up from visible domains when fewer than four are saved", () => {
    const layout = resolveLayout(profile({
      domains: { personal: { mobilePinned: true }, house: { visible: false } },
    }));
    expect(layout.mobilePins).toEqual(["personal", "alerts", "infra", "sites"]);
  });

  it("truncates to four when more are saved, keeping navigation order", () => {
    const layout = resolveLayout(profile({
      domains: Object.fromEntries(DEFAULT_DOMAIN_ORDER.map((id) => [id, { mobilePinned: true }])),
    }));
    expect(layout.mobilePins).toEqual(DEFAULT_DOMAIN_ORDER.slice(0, MOBILE_PIN_COUNT));
  });

  it("replaces a saved pin whose domain is hidden", () => {
    const layout = resolveLayout(profile({
      domains: {
        house: { mobilePinned: true, visible: false },
        alerts: { mobilePinned: true },
        infra: { mobilePinned: true },
        sites: { mobilePinned: true },
      },
    }));
    expect(layout.mobilePins).toEqual(["alerts", "infra", "sites", "money"]);
  });

  it("always returns exactly four, even with fewer than four visible domains", () => {
    const layout = resolveLayout(profile({
      domains: Object.fromEntries(
        DEFAULT_DOMAIN_ORDER.filter((id) => id !== "house").map((id) => [id, { visible: false }])
      ),
    }));
    expect(layout.mobilePins).toHaveLength(MOBILE_PIN_COUNT);
    expect(layout.mobilePins[0]).toBe("house");
    expect(layout.domains.map((d) => d.viewId)).toEqual(["house"]);
  });
});

describe("normalizeProfile", () => {
  const defaults = resolveLayout(null);

  it.each([
    ["null", null],
    ["a string", "profile"],
    ["an array", []],
    ["a wrong schema version", { schemaVersion: 99, revision: 3, views: { sites: { order: ["domains"] } } }],
    ["a missing schema version", { revision: 3 }],
  ])("resolves %s to the defaults", (_label, raw) => {
    expect(normalizeProfile(raw)).toEqual({ schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 0 });
    expect(resolveLayout(raw as LayoutProfile)).toEqual(defaults);
  });

  it("drops garbage fields one by one instead of throwing", () => {
    const clean = normalizeProfile({
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      revision: -4,
      domains: {
        sites: { visible: "no", order: "first", mobilePinned: 1 },
        nowhere: { visible: false },
        money: "hidden",
      },
      views: {
        sites: { order: "domains", modules: { domains: { width: "huge", density: 5, enabled: "yes" } } },
        money: { order: ["bank", 7, null], modules: [] },
        nowhere: { order: [] },
        dev: 42,
      },
    });
    expect(clean).toEqual({
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      revision: 0,
      domains: { sites: {} },
      views: { sites: { modules: { domains: {} } }, money: { order: ["bank"] } },
    });
    expect(() => resolveLayout(clean)).not.toThrow();
    expect(resolveView("money", clean).modules.map((m) => m.moduleId)).toEqual(["bank", "unbilled", "timeentries"]);
  });

  it("passes a well-formed profile through unchanged", () => {
    const good = profile({
      revision: 7,
      domains: { wall: { visible: false, order: 2, mobilePinned: false } },
      views: { infra: { order: ["crons"], modules: { crons: { enabled: true, width: "full", density: "summary" } } } },
    });
    expect(normalizeProfile(good)).toEqual(good);
  });
});
