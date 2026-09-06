import { describe, expect, it } from "vitest";
import { MODULE_BY_ID, MODULE_CATALOG } from "./catalog";
import {
  applyGroup,
  applyModuleOverride,
  applyOrder,
  applyRects,
  currentOrder,
  moveAmongVisible,
  nextGroupId,
  placeBefore,
  removeGroup,
  renameGroup,
  setGroupTone,
} from "./client";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import { resolveView } from "./resolver";
import {
  EMPTY_PROFILE,
  GROUP_TONES,
  LAYOUT_SCHEMA_VERSION,
  MAX_GROUPS,
  MAX_GROUP_NAME,
  type LayoutProfile,
  type TileRect,
} from "./types";

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

describe("grouping tiles", () => {
  const groupsOf = (p: LayoutProfile) => p.views?.canvas?.groups;

  it("creates a group and shows it as one border around its members", () => {
    const next = applyGroup(profile(), "canvas", { id: "g1", name: "Infra", modules: ["servers", "crons"] });
    expect(groupsOf(next)).toEqual([{ id: "g1", name: "Infra", modules: ["servers", "crons"] }]);
    const view = resolveView("canvas", next);
    expect(view.groups.map((g) => g.id)).toEqual(["g1"]);
    expect(view.groups[0].moduleIds).toEqual(["servers", "crons"]);
  });

  it("does not touch the profile it was given", () => {
    const before = profile();
    applyGroup(before, "canvas", { id: "g1", name: "Infra", modules: ["servers"] });
    expect(before).toEqual(profile());
  });

  it("returns the same object when nothing changed", () => {
    // This is the signal the provider uses to skip a write. Without it,
    // re-applying a group the profile already holds would climb the
    // revision and open the password prompt for no change at all.
    const one = applyGroup(profile(), "canvas", { id: "g1", name: "Infra", modules: ["servers", "crons"] });
    expect(applyGroup(one, "canvas", { id: "g1", name: "Infra", modules: ["servers", "crons"] })).toBe(one);
    // A name that only differs by surrounding space is the same name.
    expect(applyGroup(one, "canvas", { id: "g1", name: " Infra ", modules: ["servers", "crons"] })).toBe(one);
    // And tone 0 is the default, so stating it is not a change either.
    expect(applyGroup(one, "canvas", { id: "g1", name: "Infra", modules: ["servers", "crons"], tone: 0 })).toBe(one);
    expect(renameGroup(one, "canvas", "g1", "Infra")).toBe(one);
    expect(setGroupTone(one, "canvas", "g1", 0)).toBe(one);
    expect(removeGroup(one, "canvas", "nope")).toBe(one);
  });

  it("refuses a group the canvas cannot hold", () => {
    const before = profile();
    // A module that is not in the catalog would draw a border around nothing.
    expect(applyGroup(before, "canvas", { id: "g1", name: "x", modules: ["no-such-module"] })).toBe(before);
    expect(applyGroup(before, "canvas", { id: "g1", name: "x", modules: [] })).toBe(before);
    expect(applyGroup(before, "canvas", { id: "Bad Id", name: "x", modules: ["servers"] })).toBe(before);
    expect(
      applyGroup(before, "canvas", { id: "g1", name: "n".repeat(MAX_GROUP_NAME + 1), modules: ["servers"] })
    ).toBe(before);
    expect(applyGroup(before, "canvas", { id: "g1", name: "x", modules: ["servers"], tone: GROUP_TONES })).toBe(before);
    expect(applyGroup(before, "canvas", { id: "g1", name: "x", modules: ["servers"], tone: -1 })).toBe(before);
    expect(renameGroup(before, "canvas", "g1", "x")).toBe(before);
    expect(setGroupTone(before, "canvas", "g1", 2)).toBe(before);
  });

  it("takes a module out of its old group rather than putting it in two", () => {
    // The renderer draws one border per tile, so overlapping membership is
    // not a state the canvas is ever allowed to reach.
    const one = applyGroup(profile(), "canvas", { id: "g1", name: "One", modules: ["servers", "crons"] });
    const two = applyGroup(one, "canvas", { id: "g2", name: "Two", modules: ["crons", "gpu"] });
    expect(groupsOf(two)).toEqual([
      { id: "g1", name: "One", modules: ["servers"] },
      { id: "g2", name: "Two", modules: ["crons", "gpu"] },
    ]);
  });

  it("dissolves a group that has been emptied by the move", () => {
    const one = applyGroup(profile(), "canvas", { id: "g1", name: "One", modules: ["crons"] });
    const two = applyGroup(one, "canvas", { id: "g2", name: "Two", modules: ["crons"] });
    expect(groupsOf(two)).toEqual([{ id: "g2", name: "Two", modules: ["crons"] }]);
  });

  it("replaces a group in place when the same id comes back", () => {
    const one = applyGroup(profile(), "canvas", { id: "g1", name: "One", modules: ["servers"] });
    const two = applyGroup(one, "canvas", { id: "g2", name: "Two", modules: ["crons"] });
    const edited = applyGroup(two, "canvas", { id: "g1", name: "One", modules: ["servers", "gpu"], tone: 2 });
    expect(groupsOf(edited)).toEqual([
      { id: "g1", name: "One", modules: ["servers", "gpu"], tone: 2 },
      { id: "g2", name: "Two", modules: ["crons"] },
    ]);
  });

  it("stops at the cap for a new group but still lets an existing one be edited", () => {
    // One module each, so no group steals a member from another and the
    // count is purely the cap being reached.
    expect(MODULE_CATALOG.length).toBeGreaterThan(MAX_GROUPS);
    let filled = profile();
    for (let n = 0; n < MAX_GROUPS; n += 1) {
      filled = applyGroup(filled, "canvas", {
        id: `f${n}`,
        name: `Group ${n}`,
        modules: [MODULE_CATALOG[n].id],
      });
    }
    expect(groupsOf(filled)).toHaveLength(MAX_GROUPS);
    const spare = MODULE_CATALOG[MAX_GROUPS].id;
    expect(applyGroup(filled, "canvas", { id: "extra", name: "One too many", modules: [spare] })).toBe(filled);
    // The cap is on how many borders exist, not on editing the ones there are.
    expect(renameGroup(filled, "canvas", "f0", "Renamed")).not.toBe(filled);
  });

  it("renames and recolours without touching membership", () => {
    const one = applyGroup(profile(), "canvas", { id: "g1", name: "One", modules: ["servers", "crons"] });
    const renamed = renameGroup(one, "canvas", "g1", "  Client sites  ");
    expect(groupsOf(renamed)).toEqual([{ id: "g1", name: "Client sites", modules: ["servers", "crons"] }]);
    const toned = setGroupTone(renamed, "canvas", "g1", 5);
    expect(groupsOf(toned)).toEqual([
      { id: "g1", name: "Client sites", modules: ["servers", "crons"], tone: 5 },
    ]);
    // Back to the default slot drops the field rather than storing a zero.
    expect(groupsOf(setGroupTone(toned, "canvas", "g1", 0))).toEqual([
      { id: "g1", name: "Client sites", modules: ["servers", "crons"] },
    ]);
    expect(setGroupTone(toned, "canvas", "g1", GROUP_TONES)).toBe(toned);
  });

  it("removes the groups key entirely when the last one is dissolved", () => {
    const one = applyGroup(profile(), "canvas", { id: "g1", name: "One", modules: ["servers"] });
    const gone = removeGroup(one, "canvas", "g1");
    expect(groupsOf(gone)).toBeUndefined();
    expect(resolveView("canvas", gone).groups).toEqual([]);
  });

  it("hands out the lowest free id and never reads the name", () => {
    // An id derived from the name would change under a rename, and two
    // groups are allowed to share a name.
    const empty = profile();
    expect(nextGroupId(empty, "canvas")).toBe("g1");
    const one = applyGroup(empty, "canvas", { id: nextGroupId(empty, "canvas"), name: "One", modules: ["servers"] });
    expect(nextGroupId(one, "canvas")).toBe("g2");
    const two = applyGroup(one, "canvas", { id: nextGroupId(one, "canvas"), name: "One", modules: ["crons"] });
    expect(groupsOf(two)!.map((g) => g.id)).toEqual(["g1", "g2"]);
    // A hole left by a dissolved group is reused, so ids stay short.
    expect(nextGroupId(removeGroup(two, "canvas", "g1"), "canvas")).toBe("g1");
  });
});
