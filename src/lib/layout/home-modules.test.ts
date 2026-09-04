import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, getModule } from "./catalog";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import {
  HOME_LAYOUT,
  HOME_MODULES,
  HOME_MODULE_META,
  homeAnchorId,
  homeAnchorsFor,
  homeModeFor,
  homeModulesFor,
} from "./home-modules";
import { resolveView } from "./resolver";
import { LAYOUT_SCHEMA_VERSION, type LayoutProfile } from "./types";

const HOME_IDS = HOME_MODULES.map((m) => m.id);

// Today's Home, section by section, as the console rendered it before the
// placement engine. Office is the shared `home-control` module.
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
const LIVE_ANCHORS = ["huis", "verloop", "batterij", "klimaat", "ventilatie", "airco", "office"];
const PERIOD_IDS = ["home.house", "home.energy", "home.batteries", "home.gas", "home.water", "home.climate"];
const PERIOD_ANCHORS = ["huis", "energie", "gas", "water", "klimaat"];

function profile(partial: Partial<LayoutProfile>): LayoutProfile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 1, ...partial };
}

const ids = (modules: { moduleId: string }[]) => modules.map((m) => m.moduleId);
const anchors = (entries: { id: string }[]) => entries.map((e) => e.id);

describe("Home module definitions", () => {
  it("registers every Home id once, in the composed catalog", () => {
    expect(new Set(HOME_IDS).size).toBe(HOME_IDS.length);
    for (const id of HOME_IDS) {
      expect(MODULE_CATALOG.filter((m) => m.id === id), id).toHaveLength(1);
      expect(id.startsWith("home."), id).toBe(true);
    }
  });

  it("stays on Home and never reaches the wall", () => {
    for (const entry of HOME_MODULES) {
      expect(entry.ownerView, entry.id).toBe("house");
      expect(entry.allowedViews, entry.id).toEqual(["house"]);
    }
    const wall = resolveView("wall", profile({ views: { wall: { order: HOME_IDS } } }));
    for (const id of HOME_IDS) expect(ids(wall.modules), id).not.toContain(id);
    expect(ids(DEFAULT_LAYOUTS.wall).some((id) => HOME_IDS.includes(id))).toBe(false);
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

  it("has mode meta for every placed module, Office included", () => {
    for (const placement of HOME_LAYOUT) {
      expect(HOME_MODULE_META[placement.moduleId], placement.moduleId).toBeDefined();
      expect(HOME_MODULE_META[placement.moduleId].modes.length).toBeGreaterThan(0);
    }
    expect(ids(HOME_LAYOUT).sort()).toEqual([...HOME_IDS, "home-control"].sort());
    expect(DEFAULT_LAYOUTS.house).toBe(HOME_LAYOUT);
  });

  it("keeps anchor ids unique within a mode", () => {
    for (const mode of ["live", "period"] as const) {
      const seen = anchors(homeAnchorsFor(mode, resolveView("house", null).modules));
      expect(new Set(seen).size).toBe(seen.length);
    }
  });
});

describe("Home defaults per mode", () => {
  const view = resolveView("house", null);

  it("reproduces today's live console", () => {
    expect(ids(homeModulesFor("live", view.modules))).toEqual(LIVE_IDS);
    expect(anchors(homeAnchorsFor("live", view.modules))).toEqual(LIVE_ANCHORS);
    expect(homeAnchorsFor("live", view.modules).map((e) => e.label)).toEqual([
      "Huis", "Verloop", "Batterij", "Klimaat", "Ventilatie", "Airco", "Office",
    ]);
  });

  it("reproduces today's period console: five anchors plus the battery section", () => {
    expect(ids(homeModulesFor("period", view.modules))).toEqual(PERIOD_IDS);
    expect(anchors(homeAnchorsFor("period", view.modules))).toEqual(PERIOD_ANCHORS);
    expect(homeAnchorId("period", "home.batteries")).toBe("batterij");
  });

  it("keeps the office row split: Office standard next to a wide raw metrics", () => {
    const office = view.modules.find((m) => m.moduleId === "home-control")!;
    const raw = view.modules.find((m) => m.moduleId === "home.raw-metrics")!;
    expect(office.width).toBe("standard");
    expect(raw.width).toBe("wide");
    expect(view.modules.filter((m) => !["home-control", "home.raw-metrics"].includes(m.moduleId)).every((m) => m.width === "full")).toBe(true);
  });

  it("maps the timeframe to a Home mode", () => {
    expect(homeModeFor(true)).toBe("live");
    expect(homeModeFor(false)).toBe("period");
  });

  it("gives raw metrics no anchor and the energy block a different one per mode", () => {
    expect(homeAnchorId("live", "home.raw-metrics")).toBeUndefined();
    expect(homeAnchorId("live", "home.energy")).toBe("verloop");
    expect(homeAnchorId("period", "home.energy")).toBe("energie");
    expect(homeAnchorId("period", "home.ventilation")).toBeUndefined();
  });
});

describe("Home with a saved profile", () => {
  it("hiding one module removes exactly that module and its anchor", () => {
    const view = resolveView("house", profile({
      views: { house: { modules: { "home.ventilation": { enabled: false } } } },
    }));
    expect(ids(homeModulesFor("live", view.modules))).toEqual(LIVE_IDS.filter((id) => id !== "home.ventilation"));
    expect(anchors(homeAnchorsFor("live", view.modules))).toEqual(LIVE_ANCHORS.filter((id) => id !== "ventilatie"));
    // A live-only module never showed in period mode, so nothing changes there.
    expect(ids(homeModulesFor("period", view.modules))).toEqual(PERIOD_IDS);
    expect(ids(view.hidden)).toEqual(["home.ventilation"]);
  });

  it("hiding a both-mode module removes it from both modes", () => {
    const view = resolveView("house", profile({
      views: { house: { modules: { "home.batteries": { enabled: false } } } },
    }));
    expect(anchors(homeAnchorsFor("live", view.modules))).not.toContain("batterij");
    expect(ids(homeModulesFor("period", view.modules))).not.toContain("home.batteries");
  });

  it("follows a saved order in both modes and ignores ids it does not know", () => {
    const view = resolveView("house", profile({
      views: { house: { order: ["home.climate", "ghost", "home.house"] } },
    }));
    expect(ids(homeModulesFor("live", view.modules)).slice(0, 2)).toEqual(["home.climate", "home.house"]);
    expect(ids(homeModulesFor("period", view.modules)).slice(0, 2)).toEqual(["home.climate", "home.house"]);
  });

  it("caps a width override at what the module allows", () => {
    const view = resolveView("house", profile({
      views: { house: { modules: { "home.house": { width: "compact" }, "home.gas": { width: "standard" } } } },
    }));
    expect(view.modules.find((m) => m.moduleId === "home.house")!.width).toBe("full");
    expect(view.modules.find((m) => m.moduleId === "home.gas")!.width).toBe("standard");
  });
});
