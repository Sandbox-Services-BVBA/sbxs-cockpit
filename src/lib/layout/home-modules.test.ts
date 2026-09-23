import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, getModule } from "./catalog";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import {
  HOME_MODULES,
  HOME_TIMEFRAMES,
  homeTimeframeConfig,
} from "./home-modules";
import { resolveView } from "./resolver";
import { LAYOUT_SCHEMA_VERSION, type LayoutProfile } from "./types";

const HOME_IDS = HOME_MODULES.map((module) => module.id);

function profile(partial: Partial<LayoutProfile>): LayoutProfile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 1, ...partial };
}

const ids = (modules: { moduleId: string }[]) => modules.map((module) => module.moduleId);

describe("Home module definitions", () => {
  it("registers every Home id once in the composed catalog", () => {
    expect(new Set(HOME_IDS).size).toBe(HOME_IDS.length);
    for (const id of HOME_IDS) {
      expect(MODULE_CATALOG.filter((module) => module.id === id), id).toHaveLength(1);
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

  it("marks controls and private data, and reads the shared Home feed", () => {
    expect(getModule("home.ventilation")!.sensitivity).toBe("control");
    expect(getModule("home.airco")!.sensitivity).toBe("control");
    expect(getModule("home.raw-metrics")!.sensitivity).toBe("private");
    for (const entry of HOME_MODULES) {
      if (entry.id === "home.raw-metrics") continue;
      expect(entry.dataMode, entry.id).toBe("context");
    }
  });
});

describe("widget-local Home timeframes", () => {
  it("gives analytical widgets their own range without configuring controls", () => {
    for (const id of ["home.house", "home.energy", "home.batteries", "home.climate"]) {
      expect(homeTimeframeConfig(id)?.modes, id).toEqual(["live", "day", "week", "month", "year"]);
      expect(homeTimeframeConfig(id)?.defaultMode, id).toBe("live");
    }
    for (const id of ["home.gas", "home.water"]) {
      expect(homeTimeframeConfig(id)?.modes, id).toEqual(["day", "week", "month", "year"]);
      expect(homeTimeframeConfig(id)?.defaultMode, id).toBe("week");
    }
    for (const id of ["home.ventilation", "home.airco", "home-control", "home.raw-metrics", "servers"]) {
      expect(homeTimeframeConfig(id), id).toBeNull();
    }
    expect(Object.keys(HOME_TIMEFRAMES)).toHaveLength(6);
  });

  it("keeps every enabled widget in the resolved canvas", () => {
    const view = resolveView("canvas", null);
    const canvasIds = ids(view.modules);
    for (const id of HOME_IDS) expect(canvasIds, id).toContain(id);
    expect(canvasIds).toContain("home-control");
  });
});

describe("Home with a saved canvas profile", () => {
  it("closing one module removes exactly that module", () => {
    const view = resolveView(
      "canvas",
      profile({ views: { canvas: { modules: { "home.ventilation": { enabled: false } } } } }),
    );
    expect(ids(view.modules)).not.toContain("home.ventilation");
    expect(ids(view.modules)).toContain("home.airco");
    expect(ids(view.hidden)).toContain("home.ventilation");
  });

  it("follows a saved order and ignores ids it does not know", () => {
    const view = resolveView(
      "canvas",
      profile({ views: { canvas: { order: ["home.climate", "ghost", "home.house"] } } }),
    );
    expect(ids(view.modules).slice(0, 2)).toEqual(["home.climate", "home.house"]);
  });

  it("caps a width override at what the module allows", () => {
    const view = resolveView(
      "canvas",
      profile({
        views: {
          canvas: {
            modules: {
              "home.house": { width: "compact" },
              "home.gas": { width: "standard" },
            },
          },
        },
      }),
    );
    expect(view.modules.find((module) => module.moduleId === "home.house")!.width).toBe("full");
    expect(view.modules.find((module) => module.moduleId === "home.gas")!.width).toBe("standard");
  });
});
