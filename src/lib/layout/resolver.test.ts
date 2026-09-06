import { describe, expect, it } from "vitest";
import { MODULE_CATALOG } from "./catalog";
import { DEFAULT_LAYOUTS } from "./default-layouts";
import { CANVAS_COLS, CANVAS_MAX_COLS, CANVAS_MAX_ROWS, rectsOverlap } from "./grid";
import { normalizeProfile, resolveView } from "./resolver";
import { LAYOUT_SCHEMA_VERSION, type LayoutProfile, type TileGroup } from "./types";

function profile(partial: Partial<LayoutProfile>): LayoutProfile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 1, ...partial };
}

const ids = (view: ReturnType<typeof resolveView>) => view.modules.map((m) => m.moduleId);

const SURFACES = ["canvas", "wall"] as const;

describe("resolveView with no profile", () => {
  it("follows the default placement for every surface", () => {
    for (const viewId of SURFACES) {
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

  // Bob asked for everything open on one page, so an empty hidden tray is the
  // contract: nothing is reachable any other way once navigation is gone.
  it("opens every module on the canvas by default", () => {
    const view = resolveView("canvas", null);
    expect(view.hidden).toEqual([]);
    expect(ids(view)).toHaveLength(MODULE_CATALOG.length);
  });
});

describe("resolveView with overrides", () => {
  it("honours a saved order and appends modules the profile never saw", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { order: ["domains", "uptime-grid"] } },
    }));
    expect(ids(view).slice(0, 2)).toEqual(["domains", "uptime-grid"]);
    // A module added to the catalog later still turns up, at its default slot.
    expect(ids(view)).toHaveLength(MODULE_CATALOG.length);
    expect(ids(view)).toContain("servers");
  });

  it("drops order ids that are unknown or duplicated", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { order: ["bank", "ghost-module", "servers", "bank"] } },
    }));
    expect(ids(view).slice(0, 2)).toEqual(["bank", "servers"]);
    expect(ids(view)).not.toContain("ghost-module");
    expect(ids(view).filter((id) => id === "bank")).toHaveLength(1);
  });

  it("keeps an old profile working when a module has been removed from code", () => {
    const view = resolveView("canvas", profile({
      views: {
        canvas: {
          order: ["sobriety", "agents", "projects"],
          modules: { sobriety: { enabled: false, width: "full" } },
        },
      },
    }));
    expect(ids(view).slice(0, 2)).toEqual(["agents", "projects"]);
    expect(ids(view)).not.toContain("sobriety");
  });

  it("applies enabled, width and density overrides", () => {
    const view = resolveView("canvas", profile({
      views: {
        canvas: {
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
    const view = resolveView("canvas", profile({
      views: {
        canvas: {
          modules: {
            "umami-plaq": { width: "full", density: "summary" },
            "uptime-grid": { width: "compact" },
          },
        },
      },
    }));
    // The canvas pins no width for these, so the fallback is the module's
    // own catalog default, not the width the old domain layout gave it.
    const plaq = view.modules.find((m) => m.moduleId === "umami-plaq")!;
    expect(plaq.width).toBe(plaq.definition.defaultWidth);
    expect(plaq.density).toBe("standard");
    expect(view.modules.find((m) => m.moduleId === "uptime-grid")!.width).toBe("wide");
  });

  it("never lets a required module be disabled", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { order: [], modules: { "alerts-summary": { enabled: false } } } },
    }));
    expect(ids(view)).toContain("alerts-summary");
    expect(view.hidden.map((m) => m.moduleId)).not.toContain("alerts-summary");
  });

  it("never outputs a module id that is not in the catalog", () => {
    const known = new Set(MODULE_CATALOG.map((m) => m.id));
    for (const viewId of SURFACES) {
      const view = resolveView(viewId, profile({
        views: { [viewId]: { order: ["nope", "bank", "weight"], modules: { nope: {} } } },
      }));
      for (const entry of [...view.modules, ...view.hidden]) {
        expect(known.has(entry.moduleId)).toBe(true);
        expect(entry.definition.allowedViews).toContain(viewId);
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
    const view = resolveView("canvas", profile({
      views: {
        canvas: {
          modules: { "alerts-summary": { enabled: false, density: "summary", width: "compact" } },
        },
      },
    }));
    expect(ids(view)).toContain("alerts-summary");
    expect(view.hidden.map((m) => m.moduleId)).not.toContain("alerts-summary");
    const queue = view.modules.find((m) => m.moduleId === "alerts-summary")!;
    expect(queue.density).toBe("summary");
    // compact is not an allowed width for the queue, so the default holds.
    expect(queue.width).toBe("full");
  });
});

describe("normalizeProfile", () => {
  const defaults = resolveView("canvas", null);

  it.each([
    ["null", null],
    ["a string", "profile"],
    ["an array", []],
    ["a schema version from the future", { schemaVersion: 99, revision: 3, views: { canvas: { order: ["domains"] } } }],
    ["a missing schema version", { revision: 3 }],
    ["a schema version below one", { schemaVersion: 0, revision: 3 }],
  ])("resolves %s to the defaults", (_label, raw) => {
    expect(normalizeProfile(raw)).toEqual({ schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 0 });
    expect(resolveView("canvas", raw as LayoutProfile)).toEqual(defaults);
  });

  it("drops garbage fields one by one instead of throwing", () => {
    const clean = normalizeProfile({
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      revision: -4,
      // Navigation is gone, so a profile still carrying domain overrides is
      // simply stale weight: dropped, never a crash.
      domains: { infra: { visible: false }, nowhere: { visible: true } },
      views: {
        canvas: { order: ["bank", 7, null], modules: { domains: { width: "huge", density: 5, enabled: "yes" } } },
        nowhere: { order: [] },
        dev: 42,
      },
    });
    expect(clean).toEqual({
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      revision: 0,
      views: { canvas: { order: ["bank"], modules: { domains: {} } } },
    });
    expect(() => resolveView("canvas", clean)).not.toThrow();
    expect(resolveView("canvas", clean).modules[0].moduleId).toBe("bank");
  });

  it("passes a well-formed profile through unchanged", () => {
    const good = profile({
      revision: 7,
      views: { canvas: { order: ["bank", "servers"], modules: { servers: { width: "full" } } } },
    });
    expect(normalizeProfile(good)).toEqual(good);
  });
});

describe("canvas rectangles", () => {
  const rectOf = (view: ReturnType<typeof resolveView>, id: string) =>
    view.modules.find((m) => m.moduleId === id)!.rect;

  it("gives every default tile a place on the plane, none of them overlapping", () => {
    const rects = resolveView("canvas", null).modules.map((m) => m.rect);
    expect(rects).toHaveLength(MODULE_CATALOG.length);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(CANVAS_COLS);
      expect(rect.y + rect.h).toBeLessThanOrEqual(CANVAS_MAX_ROWS);
    }
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(rectsOverlap(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it("honours a saved rectangle", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { modules: { servers: { rect: { x: 9, y: 21, w: 7, h: 11 } } } } },
    }));
    expect(rectOf(view, "servers")).toEqual({ x: 9, y: 21, w: 7, h: 11 });
    // A tile with no override is untouched by its neighbour moving.
    expect(rectOf(view, "crons")).toEqual(resolveView("canvas", null).modules.find((m) => m.moduleId === "crons")!.rect);
  });

  it("drops a malformed or out-of-bounds rectangle back to the default", () => {
    const fallback = rectOf(resolveView("canvas", null), "bank");
    const malformed: unknown[] = [
      { x: 1, y: 1, w: 4 },
      { x: -1, y: 0, w: 4, h: 6 },
      { x: 1.5, y: 0, w: 4, h: 6 },
      { x: CANVAS_MAX_COLS - 1, y: 0, w: 4, h: 6 },
      { x: 0, y: CANVAS_MAX_ROWS, w: 4, h: 6 },
      "somewhere",
      null,
    ];
    for (const rect of malformed) {
      const view = resolveView("canvas", {
        schemaVersion: LAYOUT_SCHEMA_VERSION,
        revision: 1,
        views: { canvas: { modules: { bank: { rect } } } },
      } as unknown as LayoutProfile);
      expect(rectOf(view, "bank"), JSON.stringify(rect)).toEqual(fallback);
    }
  });

  it("grows a rectangle saved below the module's minimum back up to it", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { modules: { "home.house": { rect: { x: 0, y: 0, w: 1, h: 1 } } } } },
    }));
    const house = view.modules.find((m) => m.moduleId === "home.house")!;
    expect(house.rect.w).toBe(house.definition.minSize.w);
    expect(house.rect.h).toBe(house.definition.minSize.h);
  });

  it("keeps a clamped tile on the plane rather than pushing it off the right edge", () => {
    const view = resolveView("canvas", profile({
      views: { canvas: { modules: { "home.house": { rect: { x: CANVAS_MAX_COLS - 1, y: 3, w: 1, h: 1 } } } } },
    }));
    const rect = rectOf(view, "home.house");
    expect(rect.x + rect.w).toBeLessThanOrEqual(CANVAS_MAX_COLS);
    expect(rect.y).toBe(3);
  });
});

describe("reading an older profile", () => {
  it("keeps a version 1 profile's choices and reports it as current", () => {
    // Version 2 only added rectangles. Discarding a version 1 profile would
    // silently reopen every tile Bob had closed.
    const old = { schemaVersion: 1, revision: 9, views: { canvas: { modules: { btc: { enabled: false } } } } };
    expect(normalizeProfile(old)).toEqual({
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      revision: 9,
      views: { canvas: { modules: { btc: { enabled: false } } } },
    });
    const view = resolveView("canvas", old as unknown as LayoutProfile);
    expect(view.modules.map((m) => m.moduleId)).not.toContain("btc");
    expect(view.hidden.map((m) => m.moduleId)).toContain("btc");
    // And it still gets a place on the plane the moment it is reopened.
    expect(view.hidden.find((m) => m.moduleId === "btc")!.rect.w).toBeGreaterThan(0);
  });
});


describe("tile groups", () => {
  // Fixed rectangles so the bounding box is arithmetic rather than a
  // restatement of whatever the default packer happens to produce today.
  const PLACED = {
    servers: { rect: { x: 2, y: 3, w: 6, h: 8 } },
    crons: { rect: { x: 10, y: 5, w: 4, h: 12 } },
    gpu: { rect: { x: 4, y: 20, w: 6, h: 6 } },
  };

  const grouped = (groups: TileGroup[], modules: Record<string, object> = PLACED) =>
    resolveView("canvas", profile({ views: { canvas: { modules, groups } } }));

  it("draws one rectangle around every member", () => {
    const view = grouped([{ id: "g1", name: "Infra", modules: ["servers", "crons"] }]);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].moduleIds).toEqual(["servers", "crons"]);
    // x,y is the top-left of the two, w,h reaches the far edge of both.
    expect(view.groups[0].rect).toEqual({ x: 2, y: 3, w: 12, h: 14 });
    // No tone saved means the first accent slot, never undefined.
    expect(view.groups[0].tone).toBe(0);
  });

  it("keeps a saved tone and name", () => {
    const view = grouped([{ id: "g2", name: "Boxes", modules: ["servers"], tone: 4 }]);
    expect(view.groups[0]).toMatchObject({ id: "g2", name: "Boxes", tone: 4 });
  });

  it("shrinks the border when a member is closed instead of reaching out to it", () => {
    // A closed tile is not drawn. If it still counted, the border would
    // enclose empty plane where the tile used to be, which reads as a bug
    // rather than as a group.
    const view = grouped([{ id: "g1", name: "Infra", modules: ["servers", "crons", "gpu"] }], {
      ...PLACED,
      gpu: { ...PLACED.gpu, enabled: false },
    });
    expect(view.groups[0].moduleIds).toEqual(["servers", "crons"]);
    expect(view.groups[0].rect).toEqual({ x: 2, y: 3, w: 12, h: 14 });
  });

  it("drops a group whose members are all closed rather than leaving an empty frame", () => {
    const view = grouped([{ id: "g1", name: "Infra", modules: ["servers", "crons"] }], {
      servers: { ...PLACED.servers, enabled: false },
      crons: { ...PLACED.crons, enabled: false },
    });
    expect(view.groups).toEqual([]);
    // The group is still saved: reopening either tile brings the border back.
    expect(normalizeProfile(profile({
      views: { canvas: { groups: [{ id: "g1", name: "Infra", modules: ["servers", "crons"] }] } },
    })).views?.canvas?.groups).toHaveLength(1);
  });

  it("gives a module claimed by two groups to the first one", () => {
    // The renderer assumes a tile sits inside at most one border, so the
    // answer has to be deterministic rather than whichever group is walked
    // last. First wins, and the second simply does not list it.
    const view = grouped([
      { id: "g1", name: "One", modules: ["servers", "crons"] },
      { id: "g2", name: "Two", modules: ["crons", "gpu"] },
    ]);
    expect(view.groups[0].moduleIds).toEqual(["servers", "crons"]);
    expect(view.groups[1].moduleIds).toEqual(["gpu"]);
    expect(view.groups[1].rect).toEqual({ x: 4, y: 20, w: 6, h: 6 });
  });

  it("drops a member the catalog no longer knows", () => {
    const view = grouped([{ id: "g1", name: "Infra", modules: ["servers", "sobriety", "crons"] }]);
    expect(view.groups[0].moduleIds).toEqual(["servers", "crons"]);
  });

  it("never groups on the wallboard, which has no pointer and no grouping UI", () => {
    const view = resolveView("wall", profile({
      views: { wall: { groups: [{ id: "g1", name: "Infra", modules: ["servers", "crons"] }] } },
    }));
    expect(view.groups).toEqual([]);
  });

  it("resolves a version 2 profile with no groups at all", () => {
    // Version 3 only added groups. A profile written before them keeps every
    // choice it had and simply carries no borders.
    const old = { schemaVersion: 2, revision: 4, views: { canvas: { modules: { gpu: { enabled: false } } } } };
    const view = resolveView("canvas", old as unknown as LayoutProfile);
    expect(view.groups).toEqual([]);
    expect(view.hidden.map((m) => m.moduleId)).toContain("gpu");
    expect(normalizeProfile(old).views?.canvas?.groups).toBeUndefined();
  });

  it("drops malformed group entries one at a time rather than the whole profile", () => {
    const clean = normalizeProfile({
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      revision: 2,
      views: {
        canvas: {
          groups: [
            { id: "Bad Id", name: "shouty", modules: ["servers"] },
            { id: "g1", name: "  Infra  ", modules: ["servers", 7, "crons"], tone: 99 },
            { id: "g1", name: "duplicate id", modules: ["gpu"] },
            "not a group",
            { name: "no id", modules: ["gpu"] },
            { id: "g2", name: "no modules array" },
          ],
        },
      },
    });
    expect(clean.views?.canvas?.groups).toEqual([
      // Name trimmed, the non-string member dropped, the impossible tone dropped.
      { id: "g1", name: "Infra", modules: ["servers", "crons"] },
    ]);
    expect(() => resolveView("canvas", clean)).not.toThrow();
  });
});
