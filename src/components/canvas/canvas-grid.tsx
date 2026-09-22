"use client";

// The plane.
//
// Every tile is a rectangle in grid cells and the whole board is wider and
// taller than the window, so the cockpit is moved around rather than paged
// through: drag the bare board to pan, pinch or scroll to zoom, drag a
// tile's title row (or its grip) to move it, drag an edge to resize it.
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
import {
  CANVAS_COL_PITCH,
  CANVAS_GAP,
  CANVAS_MAX_COLS,
  CANVAS_MAX_ROWS,
  CANVAS_ROW_HEIGHT,
  CANVAS_ROW_PITCH,
  planeHeight,
  planeWidth,
} from "@/lib/layout/grid";
import type { ResolvedModule, TileRect } from "@/lib/layout/types";
import { createCanvasPositionStrategy } from "./canvas-position-strategy";
import { CANVAS_WORLD_CENTER, canvasWorldOrigin, fromWorldRect, toWorldRect } from "./canvas-world";
import { useCanvasGestures } from "./use-canvas-gestures";

/** No compaction, no overlap, a blocked move snaps back. */
const COMPACTOR = getCompactor(null, false, true);

const DRAG_HANDLE_SELECTOR = "[data-canvas-drag-handle], .canvas-tile__grip";
const DRAG_CANCEL_SELECTOR =
  "button:not(.canvas-tile__grip), a, input, select, textarea, [contenteditable='true'], [data-canvas-no-drag]";

export interface CanvasGridProps {
  tiles: ResolvedModule[];
  /** Called once per finished gesture with the whole board. */
  onRects: (rects: Record<string, TileRect>) => Promise<boolean>;
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
  /** Navigation controls rendered by the fixed dock outside this component. */
  onNavigate?: (zoom: number, resetZoom: () => void, recenter: () => void) => void;
}

function toLayout(tiles: ResolvedModule[], origin: { x: number; y: number }): LayoutItem[] {
  return tiles.map((tile) => ({
    i: tile.moduleId,
    ...toWorldRect(tile.rect, origin),
    minW: tile.definition.minSize.w,
    minH: tile.definition.minSize.h,
  }));
}

function toRects(layout: Layout, origin: { x: number; y: number }): Record<string, TileRect> {
  const rects: Record<string, TileRect> = {};
  for (const item of layout) {
    rects[item.i] = fromWorldRect(
      { x: item.x, y: item.y, w: item.w, h: item.h },
      origin
    );
  }
  return rects;
}

export function CanvasGrid({ tiles, onRects, renderTile, overlay, resyncKey, onNavigate }: CanvasGridProps) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const centred = useRef(false);
  const { zoom, panning, resetZoom } = useCanvasGestures(scroller);
  // Fixed for the life of this mount. The saved board is translated into a
  // huge rendered world, centred once, while its persisted coordinates stay
  // compact and backwards compatible.
  const [origin] = useState(() =>
    tiles.length > 0
      ? canvasWorldOrigin(tiles.map((tile) => tile.rect))
      : CANVAS_WORLD_CENTER
  );
  const width = planeWidth(CANVAS_MAX_COLS);
  const height = planeHeight(CANVAS_MAX_ROWS);

  const commit = useCallback(
    (layout: Layout) => void onRects(toRects(layout, origin)),
    [onRects, origin]
  );

  const strategy = useMemo(() => createCanvasPositionStrategy(zoom), [zoom]);

  const recenter = useCallback((smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({
      left: (width * zoom - el.clientWidth) / 2,
      top: (height * zoom - el.clientHeight) / 2,
      behavior: smooth ? "smooth" : "auto",
    });
  }, [height, width, zoom]);

  useEffect(
    () => onNavigate?.(zoom, resetZoom, () => recenter(true)),
    [zoom, resetZoom, recenter, onNavigate]
  );

  // Every session starts from the marked home point. Afterwards the camera
  // only moves because Bob moves it or explicitly presses Centre.
  useLayoutEffect(() => {
    if (centred.current || tiles.length === 0) return;
    centred.current = true;
    recenter(false);
  }, [tiles, recenter]);

  return (
    <div className="canvas-plane-shell">
      <div
        ref={scroller}
        className="canvas-plane"
        data-canvas-plane
        data-panning={panning || undefined}
      >
        {/* The world keeps the same dimensions at every zoom. Only this
            scaled sizer changes, so zooming never grows or shrinks the grid
            around the viewport and never forces the camera sideways. */}
        <div
          className="canvas-plane__sizer"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <div
            className="canvas-plane__inner"
            style={
              {
                width,
                height,
                transform: zoom === 1 ? undefined : `scale(${zoom})`,
                transformOrigin: "0 0",
                "--canvas-col-pitch": `${CANVAS_COL_PITCH}px`,
                "--canvas-row-pitch": `${CANVAS_ROW_PITCH}px`,
                "--canvas-gap": `${CANVAS_GAP}px`,
                "--canvas-zoom": zoom,
                "--canvas-origin-x": `${origin.x * CANVAS_COL_PITCH}px`,
                "--canvas-origin-y": `${origin.y * CANVAS_ROW_PITCH}px`,
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
            <div className="canvas-plane__centre" aria-hidden="true">
              <span>Centre</span>
            </div>
            <div className="canvas-plane__overlay">{overlay?.(zoom)}</div>
            <GridLayout
              key={resyncKey}
              width={width}
              layout={toLayout(tiles, origin)}
              gridConfig={{
                cols: CANVAS_MAX_COLS,
                rowHeight: CANVAS_ROW_HEIGHT,
                margin: [CANVAS_GAP, CANVAS_GAP],
              }}
              dragConfig={{
                handle: DRAG_HANDLE_SELECTOR,
                cancel: DRAG_CANCEL_SELECTOR,
                bounded: false,
              }}
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

    </div>
  );
}
