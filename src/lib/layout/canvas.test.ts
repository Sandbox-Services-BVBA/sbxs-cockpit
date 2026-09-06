import { describe, expect, it } from "vitest";
import { MODULE_BY_ID, MODULE_CATALOG } from "./catalog";
import { applyModuleOverride, applyOrder, applyRects, currentOrder, moveAmongVisible, placeBefore } from "./client";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import { resolveView } from "./resolver";
import { EMPTY_PROFILE, LAYOUT_SCHEMA_VERSION, type LayoutProfile, type TileRect } from "./types";

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

describe("dragging and resizing", () => {
  const rect = (x: number, y: number, w: number, h: number): TileRect => ({ x, y, w, h });

  /** What the grid hands back after a gesture: the whole board, not a diff. */
  const board = (base: LayoutProfile, moved: Record<string, TileRect> = {}) => ({
    ...Object.fromEntries(resolveView("canvas", base).modules.map((m) => [m.moduleId, m.rect])),
    ...moved,
  });

  it("pins the whole board on the first gesture", () => {
    // Until something is dragged, no tile has a saved rectangle: every one
    // of them is wherever the code defaults put it. The first drag is
    // therefore the moment the arrangement becomes Bob's, and writing all
    // of it is the point: a later change to the defaults must not shuffle
    // his board around the one tile he happened to move.
    const next = applyRects(profile(), "canvas", board(profile(), { servers: rect(11, 30, 7, 13) }));
    const written = next.views!.canvas!.modules!;
    expect(Object.keys(written)).toHaveLength(MODULE_CATALOG.length);
    expect(written.servers.rect).toEqual(rect(11, 30, 7, 13));
  });

  it("writes only what moved once the board is pinned", () => {
    const pinned = applyRects(profile(), "canvas", board(profile()));
    const next = applyRects(pinned, "canvas", board(pinned, { crons: rect(2, 44, 5, 9) }));
    const was = pinned.views!.canvas!.modules!;
    const now = next.views!.canvas!.modules!;
    const differing = Object.keys(now).filter((id) => JSON.stringify(now[id]) !== JSON.stringify(was[id]));
    expect(differing).toEqual(["crons"]);
    expect(now.crons.rect).toEqual(rect(2, 44, 5, 9));
  });

  it("returns the same profile when the board reports what is already saved", () => {
    // The grid reports its layout on mount, not only after a gesture. If
    // that counted as a change, simply opening the page would queue a save
    // and climb the revision on every device that looked at it.
    const before = applyRects(profile(), "canvas", { servers: rect(11, 30, 7, 13) });
    const again = applyRects(before, "canvas", { servers: rect(11, 30, 7, 13) });
    expect(again).toBe(before);
  });

  it("ignores a tile the catalog has never heard of", () => {
    const before = profile();
    expect(applyRects(before, "canvas", { "gone.module": rect(0, 0, 4, 4) })).toBe(before);
  });

  it("does not disturb the other settings on the same tile", () => {
    const withDensity = applyModuleOverride(profile(), "canvas", "servers", { density: "summary" });
    const next = applyRects(withDensity, "canvas", { servers: rect(2, 2, 6, 6) });
    expect(next.views!.canvas!.modules!.servers).toEqual({ density: "summary", rect: rect(2, 2, 6, 6) });
  });

  it("survives a round trip through the resolver", () => {
    const next = applyRects(profile(), "canvas", { crons: rect(20, 40, 5, 9) });
    const shown = resolveView("canvas", next).modules.find((m) => m.moduleId === "crons")!;
    expect(shown.rect).toEqual(rect(20, 40, 5, 9));
  });
});

describe("reopening a tile", () => {
  it("comes back enabled and at the place the caller found for it", () => {
    const closed = applyModuleOverride(profile(), "canvas", CLOSABLE, { enabled: false });
    const spot = { x: 24, y: 60, w: 6, h: 13 };
    const reopened = applyModuleOverride(closed, "canvas", CLOSABLE, { enabled: true, rect: spot });
    const shown = resolveView("canvas", reopened).modules.find((m) => m.moduleId === CLOSABLE);
    expect(shown?.rect).toEqual(spot);
    expect(resolveView("canvas", reopened).hidden.map((m) => m.moduleId)).not.toContain(CLOSABLE);
  });
});
