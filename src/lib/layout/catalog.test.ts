import { describe, expect, it } from "vitest";
import { VIEWS } from "@/lib/views";
import { DEFAULT_WIDGETS } from "@/lib/widget-registry";
import { getModule, MODULE_BY_ID, MODULE_CATALOG } from "./catalog";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import { HOME_MODULES } from "./home-modules";
import type { SurfaceId } from "./types";

const PRIVATE = ["bank", "weight", "btc", "file-explorer", "file-activity", "home.raw-metrics"];
const CONTROL = ["home-control", "home.ventilation", "home.airco"];

describe("module catalog", () => {
  it("keeps every registry id, unchanged, so saved profiles survive", () => {
    for (const widget of DEFAULT_WIDGETS) {
      expect(getModule(widget.id), widget.id).toBeDefined();
    }
  });

  it("only adds the Infrastructure rollup and the Home modules on top of the registry", () => {
    const registryIds = new Set(DEFAULT_WIDGETS.map((widget) => widget.id));
    const extra = MODULE_CATALOG.filter((entry) => !registryIds.has(entry.id)).map((m) => m.id);
    expect(extra).toEqual(["infra.summary", ...HOME_MODULES.map((m) => m.id)]);
  });

  it("has unique ids and a matching lookup table", () => {
    const ids = MODULE_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(MODULE_BY_ID).sort()).toEqual([...ids].sort());
  });

  it("maps owner view and data mode from the registry", () => {
    for (const widget of DEFAULT_WIDGETS) {
      const entry = getModule(widget.id)!;
      expect(entry.ownerView, widget.id).toBe(widget.category);
      expect(entry.allowedViews, widget.id).toContain(widget.category);
      expect(entry.dataMode, widget.id).toBe(widget.selfFetch ? "self-fetch" : "shared");
    }
  });

  it("marks private data and write controls", () => {
    for (const entry of MODULE_CATALOG) {
      const expected = PRIVATE.includes(entry.id)
        ? "private"
        : CONTROL.includes(entry.id)
          ? "control"
          : "normal";
      expect(entry.sensitivity, entry.id).toBe(expected);
    }
  });

  it("only makes the alert summary required", () => {
    const required = MODULE_CATALOG.filter((entry) => entry.required).map((m) => m.id);
    expect(required).toEqual(["alerts-summary"]);
  });

  it("keeps every default inside its own allowed set", () => {
    for (const entry of MODULE_CATALOG) {
      expect(entry.allowedWidths, entry.id).toContain(entry.defaultWidth);
      expect(entry.allowedDensities, entry.id).toContain(entry.defaultDensity);
      expect(entry.defaultDensity).toBe("standard");
    }
  });

  it("offers a density choice only to list-heavy modules", () => {
    const listy = MODULE_CATALOG.filter((m) => m.allowedDensities.length > 1).map((m) => m.id);
    expect(listy.sort()).toEqual(
      ["alerts-summary", "backups", "connections", "crons", "domains", "file-activity", "projects", "servers", "services", "uptime-grid"]
    );
  });
});

describe("default layouts", () => {
  // Only two surfaces render a layout now: the canvas and the wallboard. The
  // domain ids the catalog still carries are ownership tags for the Add
  // tray, not pages, so nothing places modules by domain any more.
  const surfaces = VIEWS.map((view) => view.id as SurfaceId);

  it("has a placement list for every surface, and only surfaces", () => {
    expect(Object.keys(DEFAULT_LAYOUTS).sort()).toEqual([...surfaces].sort());
  });

  it("only places catalog modules where they are allowed, once each", () => {
    for (const surface of surfaces) {
      const seen = new Set<string>();
      for (const placement of DEFAULT_LAYOUTS[surface]) {
        const entry = getModule(placement.moduleId);
        expect(entry, `${surface}:${placement.moduleId}`).toBeDefined();
        expect(entry!.allowedViews, `${surface}:${placement.moduleId}`).toContain(surface);
        if (placement.width) expect(entry!.allowedWidths).toContain(placement.width);
        if (placement.density) expect(entry!.allowedDensities).toContain(placement.density);
        expect(seen.has(placement.moduleId), `${surface}:${placement.moduleId}`).toBe(false);
        seen.add(placement.moduleId);
      }
    }
  });

  // The canvas is the whole app. A module missing from it cannot be reached
  // at all now that there is no navigation, so this is the important one.
  it("places every catalogued module on the canvas", () => {
    for (const entry of MODULE_CATALOG) {
      const placed = DEFAULT_LAYOUTS.canvas.some((p) => p.moduleId === entry.id);
      expect(placed, `canvas:${entry.id}`).toBe(true);
    }
  });

  it("never places a private or control module on the wallboard", () => {
    for (const placement of DEFAULT_LAYOUTS.wall) {
      const entry = MODULE_BY_ID[placement.moduleId];
      expect(entry.sensitivity, `wall:${placement.moduleId}`).toBe("normal");
    }
  });
});
