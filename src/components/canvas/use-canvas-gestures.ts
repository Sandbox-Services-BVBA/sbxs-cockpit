"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Every gesture that belongs to the plane rather than to a tile: drag the
// bare board to move around it, pinch or ctrl-scroll to zoom the whole thing.
//
// All of it is wired with native listeners rather than React props for one
// reason: a wheel handler has to be able to call preventDefault, and React
// registers wheel passively on the root, where preventDefault is ignored.
// Once one listener has to be native the rest may as well join it, so the
// element only ever has one set of rules.

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1.6;
/** Below a few pixels a drag is still a click: clearing a selection, say. */
const PAN_SLOP = 4;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export interface CanvasGestures {
  zoom: number;
  panning: boolean;
  /** Stable for the life of the hook, so a consumer may put it in a dep list. */
  resetZoom: () => void;
}

/**
 * `scroller` is the element that scrolls; the plane inside it is expected to
 * be scaled from its top-left corner.
 */
export function useCanvasGestures(scroller: RefObject<HTMLDivElement | null>): CanvasGestures {
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  // The listeners below are attached once and never see a re-render, so
  // everything they need has to be reachable through a ref rather than
  // captured in a closure. Re-attaching them per render would tear down a
  // pan halfway through it.
  const zoomRef = useRef(1);
  const zoomAtRef = useRef<((next: number, clientX?: number, clientY?: number) => void) | null>(null);

  /**
   * Zoom towards a point in client coordinates, or the centre of the view
   * when none is given. Keeping whatever is under the pointer under the
   * pointer is the whole trick: zoom that pulls towards a corner makes a
   * big board impossible to navigate.
   */
  function zoomAt(next: number, clientX?: number, clientY?: number) {
    const el = scroller.current;
    if (!el) return;
    const from = zoomRef.current;
    const to = clampZoom(next);
    if (to === from) return;

    const box = el.getBoundingClientRect();
    const pointerX = (clientX ?? box.left + box.width / 2) - box.left;
    const pointerY = (clientY ?? box.top + box.height / 2) - box.top;
    // Where that point sits on the board, in unscaled plane pixels.
    const planeX = (el.scrollLeft + pointerX) / from;
    const planeY = (el.scrollTop + pointerY) / from;

    zoomRef.current = to;
    setZoom(to);

    // The sizer has not been re-laid-out yet, so the scroll has to wait a
    // frame or the browser clamps it against the old, smaller extent.
    requestAnimationFrame(() => {
      el.scrollLeft = planeX * to - pointerX;
      el.scrollTop = planeY * to - pointerY;
    });
  }

  // Declared before the listener effect, so it has run by the time the
  // listeners exist.
  useEffect(() => {
    zoomAtRef.current = zoomAt;
  });

  // A lazy initialiser gives one function for the life of the hook without
  // memoizing anything, so the identity a consumer depends on never changes.
  const [resetZoom] = useState(() => () => zoomAtRef.current?.(1));

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    // Only the mesh starts a plane gesture. A pointer that went down on a
    // tile belongs to that tile: dragging it, resizing it, scrolling its
    // list. Group frames handle their own drag and are excluded the same way.
    const onPlane = (target: EventTarget | null) =>
      target instanceof Element && target.classList.contains("canvas-plane__mesh");

    const pointers = new Map<number, { x: number; y: number }>();
    let pan: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
    let pinch: { distance: number; zoom: number } | null = null;

    const midpoint = () => {
      const points = [...pointers.values()];
      return {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!onPlane(event.target)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        // A second finger turns a pan into a pinch, mid-gesture.
        pan = null;
        pinch = { distance: midpoint().distance, zoom: zoomRef.current };
        setPanning(false);
        return;
      }
      if (pointers.size === 1) {
        pan = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pinch && pointers.size === 2) {
        const { x, y, distance } = midpoint();
        if (pinch.distance > 0) zoomAtRef.current?.((pinch.zoom * distance) / pinch.distance, x, y);
        event.preventDefault();
        return;
      }

      if (!pan) return;
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (!pan.moved && Math.abs(dx) + Math.abs(dy) < PAN_SLOP) return;
      if (!pan.moved) {
        pan.moved = true;
        setPanning(true);
      }
      el.scrollLeft = pan.left - dx;
      el.scrollTop = pan.top - dy;
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        pan = null;
        setPanning(false);
      }
    };

    const onWheel = (event: WheelEvent) => {
      // A trackpad pinch arrives as ctrl and a wheel. A plain wheel is left
      // alone so two fingers still scroll the board the ordinary way.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomAtRef.current?.(zoomRef.current * Math.exp(-event.deltaY / 240), event.clientX, event.clientY);
    };

    el.addEventListener("pointerdown", onPointerDown);
    // On window, not the element: the pointer routinely leaves the plane
    // mid-drag and the gesture has to keep tracking it.
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [scroller]);

  return { zoom, panning, resetZoom };
}
