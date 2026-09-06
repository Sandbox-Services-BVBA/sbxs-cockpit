import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, getModule } from "./catalog";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import {
  HOME_MODULES,
  HOME_MODULE_META,
  homeModeFor,
  homeModuleApplies,
  homeModulesFor,
} from "./home-modules";
import { resolveView } from "./resolver";
import { LAYOUT_SCHEMA_VERSION, type LayoutProfile } from "./types";

const HOME_IDS = HOME_MODULES.map((m) => m.id);

// The house sections as the console drew them, per mode. Office is the
// shared `home-control` module.
const LIVE_IDS = [
  "home.house",
  "home.energy",
  "home.batteries",
  "home.climate",
  "home.ventilation",
  "home.airco",
  "home-control",
  "home.raw-metrics",
];
const PERIOD_IDS = ["home.house", "home.energy", "home.batteries", "home.gas", "home.water", "home.climate"];

function profile(partial: Partial<LayoutProfile>): LayoutProfile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 1, ...partial };
}

const ids = (modules: { moduleId: string }[]) => modules.map((m) => m.moduleId);

describe("Home module definitions", () => {
  it("registers every Home id once, in the composed catalog", () => {
    expect(new Set(HOME_IDS).size).toBe(HOME_IDS.length);
    for (const id of HOME_IDS) {
      expect(MODULE_CATALOG.filter((m) => m.id === id), id).toHaveLength(1);
      expect(id.startsWith("home."), id).toBe(true);
    }
  });

  it("lives on the canvas and never reaches the wall", () => {
    for (const entry of HOME_MODULES) {
      expect(entry.ownerView, entry.id).toBe("house");
      expect(entry.allowedViews, entry.id).toEqual(["canvas", "house"]);
    }
    const wall = resolveView("wall", profile({ views: { wall: { order: HOME_IDS } } }));
    for (const id of HOME_IDS) expect(ids(wall.modules), id).not.toContain(id);
    expect(ids(DEFAULT_LAYOUTS.wall).some((id) => HOME_IDS.includes(id))).toBe(false);
    for (const id of HOME_IDS) expect(ids(DEFAULT_LAYOUTS.canvas), id).toContain(id);
  });

  it("marks controls and private data, and reads the console context", () => {
    expect(getModule("home.ventilation")!.sensitivity).toBe("control");
    expect(getModule("home.airco")!.sensitivity).toBe("control");
    expect(getModule("home.raw-metrics")!.sensitivity).toBe("private");
    for (const entry of HOME_MODULES) {
      if (entry.id === "home.raw-metrics") continue;
      expect(entry.dataMode, entry.id).toBe("context");
    }
  });

  it("has mode meta for every Home module on the canvas, Office included", () => {
    for (const id of [...HOME_IDS, "home-control"]) {
      expect(HOME_MODULE_META[id], id).toBeDefined();
      expect(HOME_MODULE_META[id].modes.length, id).toBeGreaterThan(0);
    }
  });
});

describe("Mode filtering", () => {
  it("maps the timeframe to a Home mode", () => {
    expect(homeModeFor(true)).toBe("live");
    expect(homeModeFor(false)).toBe("period");
  });

  it("keeps gas and water for a period and the controls for live", () => {
    for (const id of ["home.gas", "home.water"]) {
      expect(homeModuleApplies(id, "period"), id).toBe(true);
      expect(homeModuleApplies(id, "live"), id).toBe(false);
    }
    for (const id of ["home.ventilation", "home.airco", "home-control", "home.raw-metrics"]) {
      expect(homeModuleApplies(id, "live"), id).toBe(true);
      expect(homeModuleApplies(id, "period"), id).toBe(false);
    }
    for (const id of ["home.house", "home.energy", "home.batteries", "home.climate"]) {
      expect(homeModuleApplies(id, "live"), id).toBe(true);
      expect(homeModuleApplies(id, "period"), id).toBe(true);
    }
  });

  it("never hides a module that is not Home's", () => {
    expect(homeModuleApplies("servers", "live")).toBe(true);
    expect(homeModuleApplies("servers", "period")).toBe(true);
    expect(homeModuleApplies("ghost", "period")).toBe(true);
  });

  it("filters the canvas in canvas order and leaves non-Home modules out", () => {
    const canvas = resolveView("canvas", null);
    const live = ids(homeModulesFor("live", canvas.modules));
    const period = ids(homeModulesFor("period", canvas.modules));
    expect(live.sort()).toEqual([...LIVE_IDS].sort());
    expect(period.sort()).toEqual([...PERIOD_IDS].sort());
    expect(live).not.toContain("servers");
    // Order is the canvas's, not HOME_LAYOUT's: the house sits before Office.
    const all = ids(canvas.modules);
    expect(all.indexOf("home.house")).toBeLessThan(all.indexOf("home-control"));
  });
});

describe("Home defaults per mode", () => {
  const view = resolveView("canvas", null);

  it("reproduces the live console", () => {
    expect(ids(homeModulesFor("live", view.modules)).sort()).toEqual([...LIVE_IDS].sort());
  });

  it("reproduces the period console", () => {
    expect(ids(homeModulesFor("period", view.modules)).sort()).toEqual([...PERIOD_IDS].sort());
  });

});

describe("Home with a saved canvas profile", () => {
  it("closing one module removes exactly that module", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { modules: { "home.ventilation": { enabled: false } } } },
    }));
    expect(ids(homeModulesFor("live", view.modules))).not.toContain("home.ventilation");
    expect(ids(homeModulesFor("live", view.modules))).toContain("home.airco");
    // A live-only module never showed in period mode, so nothing changes there.
    expect(ids(homeModulesFor("period", view.modules)).sort()).toEqual([...PERIOD_IDS].sort());
    expect(ids(view.hidden)).toContain("home.ventilation");
  });

  it("closing a both-mode module removes it from both modes", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { modules: { "home.batteries": { enabled: false } } } },
    }));
    expect(ids(homeModulesFor("live", view.modules))).not.toContain("home.batteries");
    expect(ids(homeModulesFor("period", view.modules))).not.toContain("home.batteries");
  });

  it("follows a saved order in both modes and ignores ids it does not know", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { order: ["home.climate", "ghost", "home.house"] } },
    }));
    expect(ids(homeModulesFor("live", view.modules)).slice(0, 2)).toEqual(["home.climate", "home.house"]);
    expect(ids(homeModulesFor("period", view.modules)).slice(0, 2)).toEqual(["home.climate", "home.house"]);
  });

  it("caps a width override at what the module allows", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { modules: { "home.house": { width: "compact" }, "home.gas": { width: "standard" } } } },
    }));
    expect(view.modules.find((m) => m.moduleId === "home.house")!.width).toBe("full");
    expect(view.modules.find((m) => m.moduleId === "home.gas")!.width).toBe("standard");
  });
});
