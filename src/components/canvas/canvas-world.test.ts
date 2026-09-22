import { describe, expect, it } from "vitest";
import { CANVAS_MAX_COLS, CANVAS_MAX_ROWS } from "@/lib/layout/grid";
import type { TileRect } from "@/lib/layout/types";
import { CANVAS_WORLD_CENTER, canvasWorldOrigin, fromWorldRect, toWorldRect } from "./canvas-world";

describe("canvas world", () => {
  const rects: TileRect[] = [
    { x: 0, y: 0, w: 8, h: 9 },
    { x: 8, y: 9, w: 12, h: 18 },
  ];

  it("places the saved board around the middle of the rendered world", () => {
    const origin = canvasWorldOrigin(rects);
    const world = rects.map((rect) => toWorldRect(rect, origin));
    const bounds = {
      left: Math.min(...world.map((rect) => rect.x)),
      right: Math.max(...world.map((rect) => rect.x + rect.w)),
      top: Math.min(...world.map((rect) => rect.y)),
      bottom: Math.max(...world.map((rect) => rect.y + rect.h)),
    };

    expect(Math.abs((bounds.left + bounds.right) / 2 - CANVAS_WORLD_CENTER.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((bounds.top + bounds.bottom) / 2 - CANVAS_WORLD_CENTER.y)).toBeLessThanOrEqual(0.5);
  });

  it("round-trips world positions without changing saved coordinates", () => {
    const origin = canvasWorldOrigin(rects);
    expect(rects.map((rect) => fromWorldRect(toWorldRect(rect, origin), origin))).toEqual(rects);
  });

  it("keeps near-limit profiles inside the safety bounds", () => {
    const edge = [{ x: CANVAS_MAX_COLS - 8, y: CANVAS_MAX_ROWS - 9, w: 8, h: 9 }];
    const origin = canvasWorldOrigin(edge);
    const world = toWorldRect(edge[0], origin);

    expect(world.x).toBeGreaterThanOrEqual(0);
    expect(world.y).toBeGreaterThanOrEqual(0);
    expect(world.x + world.w).toBeLessThanOrEqual(CANVAS_MAX_COLS);
    expect(world.y + world.h).toBeLessThanOrEqual(CANVAS_MAX_ROWS);
  });
});
