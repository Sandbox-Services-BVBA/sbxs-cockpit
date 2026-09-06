"use client";

// The plane.
//
// Every tile is a rectangle in grid cells and the whole board is wider and
// taller than the window, so the cockpit is scrolled in two directions
// rather than paged through. react-grid-layout owns the gesture and the
// arithmetic; this file owns the three decisions that make the board feel
// like a board:
//
//   - nothing compacts. A tile stays exactly where it was put. A dashboard
//     that reflows the moment something is dragged is a dashboard you can
//     never learn the shape of.
//   - nothing overlaps, and a move into occupied space is refused rather
//     than resolved by shoving the neighbours aside. One drag can then
//     never scatter an arrangement that took a while to build.
//   - a gesture writes, a render does not. The grid reports its layout on
//     mount as well as after a drag, and committing that would save a full
//     board (and ask for the password) just because someone opened the
//     page, so only drag-stop and resize-stop commit.

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import GridLayout, { getCompactor, type Layout, type LayoutItem } from "react-grid-layout";
import {
  CANVAS_COLS,
  CANVAS_GAP,
  CANVAS_PLANE_WIDTH,
  CANVAS_ROW_HEIGHT,
  tileLeftPx,
  tileTopPx,
  tileWidthPx,
  tileHeightPx,
} from "@/lib/layout/grid";
import type { ResolvedModule, TileRect } from "@/lib/layout/types";

/** No compaction, no overlap, a blocked move snaps back. */
const COMPACTOR = getCompactor(null, false, true);

const GRIP_SELECTOR = ".canvas-tile__grip";

export interface CanvasGridProps {
  tiles: ResolvedModule[];
  /** Called once per finished gesture with the whole board. */
  onRects: (rects: Record<string, TileRect>) => void;
  renderTile: (tile: ResolvedModule) => ReactNode;
  /**
   * Bumped by the caller when a commit was refused, to make the grid drop
   * the position it is holding internally and re-read the profile. Without
   * it a cancelled password prompt leaves a tile drawn where it was dropped
   * but saved where it started.
   */
  resyncKey: number;
}

function toLayout(tiles: ResolvedModule[]): LayoutItem[] {
  return tiles.map((tile) => ({
    i: tile.moduleId,
    ...tile.rect,
    minW: tile.definition.minSize.w,
    minH: tile.definition.minSize.h,
  }));
}

function toRects(layout: Layout): Record<string, TileRect> {
  const rects: Record<string, TileRect> = {};
  for (const item of layout) rects[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
  return rects;
}

export function CanvasGrid({ tiles, onRects, renderTile, resyncKey }: CanvasGridProps) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const centred = useRef(false);

  const commit = useCallback((layout: Layout) => onRects(toRects(layout)), [onRects]);

  // Open on the middle of the board rather than its top-left corner, so
  // Bob starts where he arranged things and works outwards in every
  // direction. Once only: re-centring after a drag would fight him.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || centred.current || tiles.length === 0) return;
    centred.current = true;

    const centres = tiles.map((tile) => ({
      x: tileLeftPx(tile.rect.x) + tileWidthPx(tile.rect.w) / 2,
      y: tileTopPx(tile.rect.y) + tileHeightPx(tile.rect.h) / 2,
    }));
    const mid = {
      x: (Math.min(...centres.map((c) => c.x)) + Math.max(...centres.map((c) => c.x))) / 2,
      y: (Math.min(...centres.map((c) => c.y)) + Math.max(...centres.map((c) => c.y))) / 2,
    };
    // The tile nearest that point, so the view lands on something real
    // rather than on the gap the average happens to fall in.
    const nearest = centres.reduce((best, c) =>
      Math.hypot(c.x - mid.x, c.y - mid.y) < Math.hypot(best.x - mid.x, best.y - mid.y) ? c : best
    );
    el.scrollLeft = nearest.x - el.clientWidth / 2;
    el.scrollTop = nearest.y - el.clientHeight / 2;
  }, [tiles]);

  return (
    <div ref={scroller} className="canvas-plane" data-canvas-plane>
      <div className="canvas-plane__inner" style={{ width: CANVAS_PLANE_WIDTH }}>
        <GridLayout
          key={resyncKey}
          width={CANVAS_PLANE_WIDTH}
          layout={toLayout(tiles)}
          gridConfig={{
            cols: CANVAS_COLS,
            rowHeight: CANVAS_ROW_HEIGHT,
            margin: [CANVAS_GAP, CANVAS_GAP],
          }}
          dragConfig={{ handle: GRIP_SELECTOR, bounded: false }}
          resizeConfig={{ handles: ["se", "e", "s"] }}
          compactor={COMPACTOR}
          onDragStop={(layout) => commit(layout)}
          onResizeStop={(layout) => commit(layout)}
        >
          {tiles.map((tile) => (
            <div key={tile.moduleId} data-module-id={tile.moduleId} className="canvas-tile">
              {renderTile(tile)}
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}
