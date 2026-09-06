// The canvas plane.
//
// The cockpit is one plane, wider and taller than the window, that Bob
// scrolls in both directions. A tile's place on it is a rectangle in grid
// units: x and y in cells from the top-left, w and h in cells. Pixels are
// derived here and nowhere else, so changing the feel of the board is a
// change to four numbers.

import type { TileRect, TileSize } from "./types";

/**
 * Columns the plane starts with, and the packing width for the code-owned
 * defaults. Roughly two and a bit desktop screens.
 */
export const CANVAS_COLS = 32;
/**
 * The plane always keeps this much empty board past the outermost tile, and
 * grows to provide it. Without spare room there is nowhere to drag a tile
 * *to*: the board would be exactly as big as what is already on it, and
 * rearranging would mean swapping rather than moving.
 */
export const CANVAS_SPARE_COLS = 8;
export const CANVAS_SPARE_ROWS = 12;
/** Where growing stops, so a runaway profile cannot ask for a mile of board. */
export const CANVAS_MAX_COLS = 96;
/** One column, in pixels, before the gap. */
export const CANVAS_COL_WIDTH = 92;
/** One row, in pixels, before the gap. */
export const CANVAS_ROW_HEIGHT = 20;
/** The gutter between tiles, and the padding around the plane. */
export const CANVAS_GAP = 12;
/**
 * How far down the plane a tile may be placed. Deep enough that Bob will
 * never hit it, shallow enough that a corrupt profile cannot ask the
 * browser for a kilometre of empty div.
 */
export const CANVAS_MAX_ROWS = 400;

/**
 * How wide the board has to be to hold these tiles and still offer room to
 * drag one further out. It grows as Bob works outwards and never shrinks
 * below the starting width, so the board he learned the shape of keeps it.
 */
export function planeCols(rects: readonly TileRect[]): number {
  const furthest = rects.reduce((max, rect) => Math.max(max, rect.x + rect.w), 0);
  return Math.min(CANVAS_MAX_COLS, Math.max(CANVAS_COLS, furthest + CANVAS_SPARE_COLS));
}

/** The width react-grid-layout is told a board of `cols` columns is. */
export function planeWidth(cols: number): number {
  return cols * CANVAS_COL_WIDTH + CANVAS_GAP * (cols + 1);
}



/** Pixel width of a tile that is `w` columns wide, gutters included. */
export function tileWidthPx(w: number): number {
  return w * CANVAS_COL_WIDTH + (w - 1) * CANVAS_GAP;
}

/** Centre-to-centre distance between two columns, gutter included. */
export const CANVAS_COL_PITCH = CANVAS_COL_WIDTH + CANVAS_GAP;
/** Centre-to-centre distance between two rows, gutter included. */
export const CANVAS_ROW_PITCH = CANVAS_ROW_HEIGHT + CANVAS_GAP;

/** Distance from the left edge of the plane to column `x`. */
export function tileLeftPx(x: number): number {
  return CANVAS_GAP + x * (CANVAS_COL_WIDTH + CANVAS_GAP);
}

/** Distance from the top edge of the plane to row `y`. */
export function tileTopPx(y: number): number {
  return CANVAS_GAP + y * (CANVAS_ROW_HEIGHT + CANVAS_GAP);
}

/** Pixel height of a tile that is `h` rows tall, gutters included. */
export function tileHeightPx(h: number): number {
  return h * CANVAS_ROW_HEIGHT + (h - 1) * CANVAS_GAP;
}

/**
 * The house style for tile size. Widths differ by what a module has to
 * say; the height is deliberately the same for almost everything, because
 * a board of equal-height tiles reads as a board rather than a heap. A
 * module that needs more room says so in the catalog, and Bob can drag any
 * of it to whatever he likes.
 */
export const TILE_HEIGHT = 13;

export const TILE_SIZES = {
  /** One number and a trend. */
  stat: { w: 3, h: TILE_HEIGHT },
  /** The default: a list that scrolls inside its own tile. */
  list: { w: 4, h: TILE_HEIGHT },
  /** A chart, which needs width before it needs height. */
  chart: { w: 6, h: TILE_HEIGHT },
  /** Wide lists: uptime, files, agents. */
  wide: { w: 8, h: TILE_HEIGHT },
  /** A strip across the top of a region: alerts, the infra rollup. */
  strip: { w: 12, h: 9 },
  /** The house visual, which is a picture and wants the room. */
  scene: { w: 12, h: 18 },
} as const satisfies Record<string, { w: number; h: number }>;

/** Nothing may be shrunk below this; per-module floors go in the catalog. */
export const MIN_TILE_SIZE = { w: 3, h: 5 };

/**
 * First-fit packing of code-owned defaults into the plane.
 *
 * The default layout is written as an ordered list with sizes, not as
 * hand-placed coordinates: adding a module to the catalog is then one line,
 * and the result is deterministic. Tiles are laid left to right and wrapped,
 * each new row starting below the tallest tile of the row above. The moment
 * Bob drags anything this is only the fallback for a tile his profile has
 * never seen.
 */
export function packRects(
  sizes: readonly { moduleId: string; w: number; h: number }[],
  cols: number = CANVAS_COLS
): Record<string, TileRect> {
  const out: Record<string, TileRect> = {};
  let x = 0;
  let rowTop = 0;
  let rowHeight = 0;

  for (const size of sizes) {
    const w = Math.min(size.w, cols);
    if (x + w > cols) {
      rowTop += rowHeight;
      rowHeight = 0;
      x = 0;
    }
    out[size.moduleId] = { x, y: rowTop, w, h: size.h };
    x += w;
    rowHeight = Math.max(rowHeight, size.h);
  }

  return out;
}

/** True when two rectangles share at least one cell. */
export function rectsOverlap(a: TileRect, b: TileRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * The first free slot of this size, scanning left to right and top to bottom.
 *
 * Needed when a tile comes back from the + tray: its default rectangle is
 * very likely occupied by whatever Bob has since dragged there, and two
 * tiles in the same cells would simply render on top of each other. Trying
 * `preferred` first means a tile that was closed and immediately reopened
 * lands back where it was.
 *
 * `cols` is the width to scan, and it should be the board as it currently
 * is, not as wide as it may ever grow: scanning the whole maximum would put
 * a reopened tile out on empty board to the right rather than in the gap it
 * left behind.
 */
export function findFreeRect(
  occupied: readonly TileRect[],
  size: TileSize,
  preferred?: TileRect,
  cols: number = CANVAS_COLS
): TileRect {
  const w = Math.min(size.w, cols);
  const free = (rect: TileRect) => !occupied.some((other) => rectsOverlap(rect, other));

  if (preferred && preferred.x + w <= cols && free({ ...preferred, w, h: size.h })) {
    return { ...preferred, w, h: size.h };
  }

  for (let y = 0; y < CANVAS_MAX_ROWS; y += 1) {
    for (let x = 0; x + w <= cols; x += 1) {
      const rect = { x, y, w, h: size.h };
      if (free(rect)) return rect;
    }
  }
  // The plane is full, which cannot happen with 37 tiles on 400 rows. Put it
  // at the bottom rather than throwing.
  const bottom = occupied.reduce((max, rect) => Math.max(max, rect.y + rect.h), 0);
  return { x: 0, y: bottom, w, h: size.h };
}
