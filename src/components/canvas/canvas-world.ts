import { CANVAS_MAX_COLS, CANVAS_MAX_ROWS } from "@/lib/layout/grid";
import type { TileRect } from "@/lib/layout/types";

/**
 * The rendered world is deliberately much larger than a practical layout.
 * Saved rectangles keep their compact, non-negative coordinates; this
 * offset only places that layout around the middle of the rendered world.
 */
export interface CanvasWorldOrigin {
  x: number;
  y: number;
}

export const CANVAS_WORLD_CENTER = {
  x: Math.floor(CANVAS_MAX_COLS / 2),
  y: Math.floor(CANVAS_MAX_ROWS / 2),
} as const;

function axisOrigin(
  rects: readonly TileRect[],
  start: (rect: TileRect) => number,
  end: (rect: TileRect) => number,
  centre: number,
  limit: number
): number {
  if (rects.length === 0) return centre;

  const first = rects[0];
  const minimum = rects.reduce((value, rect) => Math.min(value, start(rect)), start(first));
  const maximum = rects.reduce((value, rect) => Math.max(value, end(rect)), end(first));
  const desired = Math.round(centre - (minimum + maximum) / 2);

  // This only matters for a corrupt or near-limit profile. Ordinary boards
  // get thousands of cells of room on every side.
  return Math.max(-minimum, Math.min(limit - maximum, desired));
}

/** Place the current saved layout around the centre of the large world. */
export function canvasWorldOrigin(rects: readonly TileRect[]): CanvasWorldOrigin {
  return {
    x: axisOrigin(rects, (rect) => rect.x, (rect) => rect.x + rect.w, CANVAS_WORLD_CENTER.x, CANVAS_MAX_COLS),
    y: axisOrigin(rects, (rect) => rect.y, (rect) => rect.y + rect.h, CANVAS_WORLD_CENTER.y, CANVAS_MAX_ROWS),
  };
}

export function toWorldRect(rect: TileRect, origin: CanvasWorldOrigin): TileRect {
  return { ...rect, x: rect.x + origin.x, y: rect.y + origin.y };
}

export function fromWorldRect(rect: TileRect, origin: CanvasWorldOrigin): TileRect {
  return { ...rect, x: rect.x - origin.x, y: rect.y - origin.y };
}
