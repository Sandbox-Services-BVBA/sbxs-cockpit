import { describe, expect, it } from "vitest";
import { MODULE_BY_ID, MODULE_CATALOG } from "./catalog";
import { applyModuleOverride, applyOrder, currentOrder, moveAmongVisible, placeBefore } from "./client";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import { resolveView } from "./resolver";
import { EMPTY_PROFILE, LAYOUT_SCHEMA_VERSION, type LayoutProfile } from "./types";

// The canvas is direct manipulation over the profile: close, drag, add,
// width, density. These are the mutations the tiles make, checked against
// what the resolver then shows.

function profile(partial: Partial<LayoutProfile> = {}): LayoutProfile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 1, ...partial };
}

const REQUIRED = MODULE_CATALOG.filter((m) => m.required).map((m) => m.id);
const CLOSABLE = "servers";

describe("closing a tile", () => {
  it("writes enabled:false and the module leaves the canvas", () => {
    const next = applyModuleOverride(profile(), "canvas", CLOSABLE, { enabled: false });
    expect(next.views?.canvas?.modules?.[CLOSABLE]).toEqual({ enabled: false });
    const view = resolveView("canvas", next);
    expect(view.modules.map((m) => m.moduleId)).not.toContain(CLOSABLE);
    expect(view.hidden.map((m) => m.moduleId)).toContain(CLOSABLE);
  });

  it("does not touch the profile it was given", () => {
    const before = profile();
    applyModuleOverride(before, "canvas", CLOSABLE, { enabled: false });
    expect(before).toEqual(profile());
  });

  it("refuses to close a required module", () => {
    expect(REQUIRED).toContain("alerts-summary");
    for (const id of REQUIRED) {
      const before = profile();
      expect(applyModuleOverride(before, "canvas", id, { enabled: false })).toBe(before);
    }
  });

  it("ignores an unknown module id", () => {
    const before = profile();
    expect(applyModuleOverride(before, "canvas", "no-such-module", { enabled: false })).toBe(before);
  });
});

describe("adding a tile back from the tray", () => {
  it("re-enables a closed module in its old slot", () => {
    const closed = applyModuleOverride(profile(), "canvas", CLOSABLE, { enabled: false });
    const reopened = applyModuleOverride(closed, "canvas", CLOSABLE, { enabled: true });
    const order = resolveView("canvas", reopened).modules.map((m) => m.moduleId);
    const defaults = DEFAULT_LAYOUTS.canvas.map((p) => p.moduleId);
    expect(order).toEqual(defaults);
  });
});

describe("width and density from the tile menu", () => {
  it("keeps other overrides on the same module", () => {
    const one = applyModuleOverride(profile(), "canvas", CLOSABLE, { width: "full" });
    const two = applyModuleOverride(one, "canvas", CLOSABLE, { density: "summary" });
    expect(two.views?.canvas?.modules?.[CLOSABLE]).toEqual({ width: "full", density: "summary" });
    const entry = resolveView("canvas", two).modules.find((m) => m.moduleId === CLOSABLE)!;
    expect(entry.width).toBe("full");
    expect(entry.density).toBe("summary");
  });

  it("refuses a width or density the module does not allow", () => {
    const fixed = MODULE_CATALOG.find((m) => m.allowedDensities.length === 1)!;
    const before = profile();
    expect(applyModuleOverride(before, "canvas", fixed.id, { density: "summary" })).toBe(before);
    const narrow = MODULE_CATALOG.find((m) => !m.allowedWidths.includes("full"))!;
    expect(applyModuleOverride(before, "canvas", narrow.id, { width: "full" })).toBe(before);
  });
});

describe("reordering", () => {
  const defaults = DEFAULT_LAYOUTS.canvas.map((p) => p.moduleId);

  it("a drop produces the expected order array", () => {
    // Drag the last tile up in front of the third.
    const moved = placeBefore(defaults, defaults[defaults.length - 1], defaults[2]);
    const next = applyOrder(profile(), "canvas", moved);
    expect(next.views?.canvas?.order).toEqual(moved);
    expect(resolveView("canvas", next).modules.map((m) => m.moduleId)).toEqual(moved);
  });

  it("a keyboard move skips closed tiles and lands one visible place away", () => {
    const [first, second, third] = defaults;
    const closed = applyModuleOverride(profile(), "canvas", second, { enabled: false });
    const visible = resolveView("canvas", closed).modules.map((m) => m.moduleId);
    const order = moveAmongVisible(currentOrder(closed, "canvas"), visible, third, -1);
    const next = applyOrder(closed, "canvas", order);
    const shown = resolveView("canvas", next).modules.map((m) => m.moduleId);
    expect(shown[0]).toBe(third);
    expect(shown[1]).toBe(first);
    // The closed tile keeps its place for when it comes back.
    expect(resolveView("canvas", next).hidden.map((m) => m.moduleId)).toContain(second);
  });

  it("the same order writes nothing", () => {
    const before = profile();
    expect(applyOrder(before, "canvas", currentOrder(before, "canvas"))).toBe(before);
  });

  it("every default placement is a module the canvas allows", () => {
    for (const id of defaults) {
      expect(MODULE_BY_ID[id].allowedViews).toContain("canvas");
    }
    expect(currentOrder(EMPTY_PROFILE, "canvas")).toEqual(defaults);
  });
});
