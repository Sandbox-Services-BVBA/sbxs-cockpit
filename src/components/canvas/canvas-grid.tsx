"use client";

// The plane.
//
// Every tile is a rectangle in grid cells and the whole board is wider and
// taller than the window, so the cockpit is moved around rather than paged
// through: drag the bare board to pan, pinch or ctrl-scroll to zoom, drag a
// tile's grip to move it, drag an edge to resize it.
//
// react-grid-layout owns the gesture and the arithmetic for the tiles. This
// file owns the three decisions that make the board a board:
//
//   - nothing compacts. A tile stays exactly where it was put. A dashboard
//     that reflows the moment something is dragged is a dashboard you can
//     never learn the shape of.
//   - nothing overlaps, and a move into occupied space is refused rather
//     than resolved by shoving the neighbours aside. One drag can then
//     never scatter an arrangement.
//   - a gesture writes, a render does not. The grid reports its layout on
//     mount as well as after a drag, and committing that would save a full
//     board (and ask for the password) just because someone opened the
//     page, so only drag-stop and resize-stop commit.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import GridLayout, { getCompactor, type Layout, type LayoutItem } from "react-grid-layout";
// Only the root entry point is re-exported by the package index; the
// position strategies live on the core subpath.
import { createScaledStrategy } from "react-grid-layout/core";
import {
  CANVAS_COL_PITCH,
  CANVAS_GAP,
  CANVAS_ROW_HEIGHT,
  CANVAS_ROW_PITCH,
  CANVAS_SPARE_ROWS,
  planeCols,
  planeWidth,
  tileLeftPx,
  tileTopPx,
  tileWidthPx,
  tileHeightPx,
} from "@/lib/layout/grid";
import type { ResolvedModule, TileRect } from "@/lib/layout/types";
import { useCanvasGestures } from "./use-canvas-gestures";

/** No compaction, no overlap, a blocked move snaps back. */
const COMPACTOR = getCompactor(null, false, true);

const GRIP_SELECTOR = ".canvas-tile__grip";

export interface CanvasGridProps {
  tiles: ResolvedModule[];
  /** Called once per finished gesture with the whole board. */
  onRects: (rects: Record<string, TileRect>) => void;
  renderTile: (tile: ResolvedModule) => ReactNode;
  /**
   * Drawn behind the tiles in the same coordinate space: the group frames.
   * A render prop rather than a node, because what it draws has to know the
   * plane's scale to read a pointer delta back as cells.
   */
  overlay?: (zoom: number) => ReactNode;
  /**
   * Bumped by the caller when a commit was refused, to make the grid drop
   * the position it is holding internally and re-read the profile. Without
   * it a cancelled password prompt leaves a tile drawn where it was dropped
   * but saved where it started.
   */
  resyncKey: number;
  /** Told the current zoom, so a dock can offer a way back to 100 percent. */
  onZoom?: (zoom: number, reset: () => void) => void;
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

export function CanvasGrid({ tiles, onRects, renderTile, overlay, resyncKey, onZoom }: CanvasGridProps) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const centred = useRef(false);
  const { zoom, panning, resetZoom } = useCanvasGestures(scroller);
  // The board is always wider than what is on it, and grows as Bob works
  // outwards, so there is somewhere to drag a tile to.
  const cols = planeCols(tiles.map((tile) => tile.rect));
  const width = planeWidth(cols);
  // The plane's own height, unscaled. The scaled wrapper needs it, because a
  // CSS transform does not change layout size and the scroll extent would
  // otherwise stay at 100 percent however far out you zoom.
  const [planeHeight, setPlaneHeight] = useState(0);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setPlaneHeight(el.offsetHeight));
    observer.observe(el);
    setPlaneHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => onZoom?.(zoom, resetZoom), [zoom, resetZoom, onZoom]);

  const commit = useCallback((layout: Layout) => onRects(toRects(layout)), [onRects]);

  // Drag and resize arithmetic has to be told the plane is scaled, or the
  // pointer runs away from the tile by a factor of the zoom.
  const strategy = useMemo(() => createScaledStrategy(zoom), [zoom]);

  // Open on the middle of the board rather than its top-left corner, so Bob
  // starts where he arranged things and works outwards. Once only:
  // re-centring after a drag would fight him.
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
    <div ref={scroller} className="canvas-plane" data-canvas-plane data-panning={panning || undefined}>
      {/* Laid out at the scaled size so the scrollbars know how far the
          board actually reaches; the plane inside is scaled from its own
          top-left corner, which is the origin all the cell maths uses. */}
      <div
        className="canvas-plane__sizer"
        style={{ width: width * zoom, height: planeHeight * zoom }}
      >
        <div
          ref={inner}
          className="canvas-plane__inner"
          style={
            {
              width,
              transform: zoom === 1 ? undefined : `scale(${zoom})`,
              transformOrigin: "0 0",
              "--canvas-col-pitch": `${CANVAS_COL_PITCH}px`,
              "--canvas-row-pitch": `${CANVAS_ROW_PITCH}px`,
              "--canvas-gap": `${CANVAS_GAP}px`,
              "--canvas-spare-rows": `${CANVAS_SPARE_ROWS * CANVAS_ROW_PITCH}px`,
            } as CSSProperties
          }
        >
          {/* The mesh is a real element, not a background on the plane, and
              that is deliberate. It is what a pan or a pinch is aimed at, so
              it can carry touch-action: none while the tiles above it keep
              theirs: touch-action cannot be re-enabled by a descendant, so
              putting it on a shared ancestor would cost every widget the
              ability to scroll its own list with a finger.

              Drawn at the pitch the grid snaps to, offset by the same
              gutter, so a tile lands on a line rather than near one. */}
          <div className="canvas-plane__mesh" aria-hidden="true" />
          {overlay?.(zoom)}
          <GridLayout
            key={resyncKey}
            width={width}
            layout={toLayout(tiles)}
            gridConfig={{
              cols,
              rowHeight: CANVAS_ROW_HEIGHT,
              margin: [CANVAS_GAP, CANVAS_GAP],
            }}
            dragConfig={{ handle: GRIP_SELECTOR, bounded: false }}
            resizeConfig={{ handles: ["se", "e", "s"] }}
            compactor={COMPACTOR}
            positionStrategy={strategy}
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
    </div>
  );
}
