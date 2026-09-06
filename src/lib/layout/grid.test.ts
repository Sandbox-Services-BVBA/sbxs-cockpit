import { describe, expect, it } from "vitest";
import {
  CANVAS_COLS,
  findFreeRect,
  packRects,
  rectsOverlap,
  tileLeftPx,
  tileTopPx,
} from "./grid";
import type { TileRect } from "./types";

const size = (moduleId: string, w: number, h: number) => ({ moduleId, w, h });

describe("packRects", () => {
  it("lays tiles left to right and wraps at the edge", () => {
    const rects = packRects([size("a", 4, 6), size("b", 4, 6), size("c", 4, 6)], 8);
    expect(rects).toEqual({
      a: { x: 0, y: 0, w: 4, h: 6 },
      b: { x: 4, y: 0, w: 4, h: 6 },
      c: { x: 0, y: 6, w: 4, h: 6 },
    });
  });

  it("starts the next row below the tallest tile of the row above", () => {
    const rects = packRects([size("tall", 4, 10), size("short", 4, 3), size("next", 4, 4)], 8);
    expect(rects.next.y).toBe(10);
  });

  it("clamps a tile wider than the plane rather than pushing it off it", () => {
    const rects = packRects([size("huge", 40, 5)], 8);
    expect(rects.huge).toEqual({ x: 0, y: 0, w: 8, h: 5 });
  });

  it("never produces two tiles in the same cell", () => {
    const rects = Object.values(
      packRects(
        Array.from({ length: 40 }, (_, i) => size(`m${i}`, 3 + (i % 5), 4 + (i % 7))),
        CANVAS_COLS
      )
    );
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(rectsOverlap(rects[i], rects[j]), `${i} and ${j}`).toBe(false);
      }
    }
  });
});

describe("rectsOverlap", () => {
  const base: TileRect = { x: 4, y: 4, w: 4, h: 4 };
  it.each([
    ["itself", { x: 4, y: 4, w: 4, h: 4 }, true],
    ["a corner cell", { x: 7, y: 7, w: 4, h: 4 }, true],
    ["edge to edge on the right", { x: 8, y: 4, w: 4, h: 4 }, false],
    ["edge to edge below", { x: 4, y: 8, w: 4, h: 4 }, false],
    ["diagonally touching", { x: 8, y: 8, w: 4, h: 4 }, false],
    ["swallowing it", { x: 0, y: 0, w: 20, h: 20 }, true],
  ])("%s", (_label, other, expected) => {
    expect(rectsOverlap(base, other as TileRect)).toBe(expected);
    // Overlap is symmetric, and a one-sided implementation is an easy slip.
    expect(rectsOverlap(other as TileRect, base)).toBe(expected);
  });
});

describe("findFreeRect", () => {
  it("prefers the requested spot when it is empty", () => {
    const rect = findFreeRect([{ x: 0, y: 0, w: 4, h: 4 }], { w: 4, h: 4 }, { x: 10, y: 10, w: 4, h: 4 });
    expect(rect).toEqual({ x: 10, y: 10, w: 4, h: 4 });
  });

  it("falls back to the first free slot when the requested spot is taken", () => {
    const occupied = [{ x: 0, y: 0, w: 6, h: 4 }];
    const rect = findFreeRect(occupied, { w: 4, h: 4 }, { x: 2, y: 0, w: 4, h: 4 });
    expect(rect).toEqual({ x: 6, y: 0, w: 4, h: 4 });
    expect(occupied.some((o) => rectsOverlap(rect, o))).toBe(false);
  });

  it("never returns a rectangle that overlaps or runs off the plane", () => {
    // A board with a ragged edge, the case a naive scan gets wrong.
    const occupied: TileRect[] = [
      { x: 0, y: 0, w: 30, h: 4 },
      { x: 0, y: 4, w: 8, h: 6 },
      { x: 12, y: 4, w: 20, h: 6 },
    ];
    const rect = findFreeRect(occupied, { w: 4, h: 6 });
    expect(rect).toEqual({ x: 8, y: 4, w: 4, h: 6 });
    expect(occupied.some((o) => rectsOverlap(rect, o))).toBe(false);
    expect(rect.x + rect.w).toBeLessThanOrEqual(CANVAS_COLS);
  });

  it("clamps a size wider than the plane instead of looping forever", () => {
    const rect = findFreeRect([], { w: CANVAS_COLS + 10, h: 4 });
    expect(rect.w).toBe(CANVAS_COLS);
    expect(rect.x).toBe(0);
  });
});

describe("pixel geometry", () => {
  it("puts column zero one gutter in and grows by a whole cell", () => {
    expect(tileLeftPx(0)).toBeLessThan(tileLeftPx(1));
    expect(tileLeftPx(2) - tileLeftPx(1)).toBe(tileLeftPx(1) - tileLeftPx(0));
    expect(tileTopPx(2) - tileTopPx(1)).toBe(tileTopPx(1) - tileTopPx(0));
  });
});
