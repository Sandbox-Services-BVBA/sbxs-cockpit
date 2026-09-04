import { describe, expect, it } from "vitest";
import { BOTTOM_BAR_IDS, VIEWS } from "@/lib/views";
import { DEFAULT_WIDGETS } from "@/lib/widget-registry";
import { getModule, MODULE_BY_ID, MODULE_CATALOG } from "./catalog";
import { DEFAULT_DOMAIN_ORDER, DEFAULT_LAYOUTS, DEFAULT_MOBILE_PINS } from "./default-layouts";
import { HOME_MODULES } from "./home-modules";
import type { ViewId } from "./types";

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
      ["backups", "connections", "crons", "domains", "file-activity", "projects", "servers", "services", "uptime-grid"]
    );
  });
});

describe("default layouts", () => {
  const viewIds = VIEWS.map((view) => view.id);

  it("has a placement list for every view", () => {
    expect(Object.keys(DEFAULT_LAYOUTS).sort()).toEqual([...viewIds].sort());
  });

  it("only places catalog modules where they are allowed, once each", () => {
    for (const viewId of viewIds) {
      const seen = new Set<string>();
      for (const placement of DEFAULT_LAYOUTS[viewId]) {
        const entry = getModule(placement.moduleId);
        expect(entry, `${viewId}:${placement.moduleId}`).toBeDefined();
        expect(entry!.allowedViews, `${viewId}:${placement.moduleId}`).toContain(viewId);
        if (placement.width) expect(entry!.allowedWidths).toContain(placement.width);
        if (placement.density) expect(entry!.allowedDensities).toContain(placement.density);
        expect(seen.has(placement.moduleId), `${viewId}:${placement.moduleId}`).toBe(false);
        seen.add(placement.moduleId);
      }
    }
  });

  it("places every module in every view it is allowed in", () => {
    for (const entry of MODULE_CATALOG) {
      for (const viewId of entry.allowedViews) {
        const placed = DEFAULT_LAYOUTS[viewId].some((p) => p.moduleId === entry.id);
        expect(placed, `${viewId}:${entry.id}`).toBe(true);
      }
    }
  });

  it("reproduces the registry order inside each standard domain", () => {
    for (const viewId of ["sites", "money", "comms", "dev", "personal", "alerts"] as ViewId[]) {
      const expected = DEFAULT_WIDGETS
        .filter((widget) => widget.category === viewId)
        .sort((a, b) => a.order - b.order)
        .map((widget) => widget.id);
      expect(DEFAULT_LAYOUTS[viewId].map((p) => p.moduleId)).toEqual(expected);
    }
  });

  it("keeps the navigation order and bottom bar from lib/views", () => {
    expect(DEFAULT_DOMAIN_ORDER).toEqual(viewIds);
    expect(DEFAULT_MOBILE_PINS).toEqual(BOTTOM_BAR_IDS);
  });
});
