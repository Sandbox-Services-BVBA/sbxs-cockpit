"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  anchoredZoomScroll,
  wheelDeltaPixels,
  WHEEL_ZOOM_SETTLE_MS,
  zoomAfterWheel,
} from "./canvas-zoom";

// Every gesture that belongs to the plane rather than to a tile: drag the
// bare board to move around it, pinch or scroll to zoom the whole thing.
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
export function useCanvasGestures(
  scroller: RefObject<HTMLDivElement | null>,
  world: { width: number; height: number }
): CanvasGestures {
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  // The listeners below are attached once and never see a re-render, so
  // everything they need has to be reachable through a ref rather than
  // captured in a closure. Re-attaching them per render would tear down a
  // pan halfway through it.
  const zoomRef = useRef(1);
  const targetZoomRef = useRef(1);
  const zoomFrame = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const zoomAtRef = useRef<((next: number, clientX?: number, clientY?: number) => void) | null>(null);

  /**
   * Change transform, scroll extent and anchored scroll in one browser frame.
   * React only receives the settled zoom, so a 120 Hz trackpad does not ask
   * the complete widget grid to reconcile 120 times per second.
   */
  function applyPendingZoom() {
    zoomFrame.current = null;
    const el = scroller.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;

    const from = zoomRef.current;
    const to = targetZoomRef.current;
    if (to === from) return;
    const scroll = anchoredZoomScroll(
      { left: el.scrollLeft, top: el.scrollTop },
      anchor,
      from,
      to
    );

    // These variables own the camera. React does not declare them, so an
    // unrelated dashboard refresh cannot overwrite a gesture mid-frame.
    el.style.setProperty("--canvas-zoom", String(to));
    el.style.setProperty("--canvas-scaled-width", `${world.width * to}px`);
    el.style.setProperty("--canvas-scaled-height", `${world.height * to}px`);
    el.scrollTo(scroll);
    zoomRef.current = to;
  }

  function commitZoom(delay = WHEEL_ZOOM_SETTLE_MS) {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      setZoom(zoomRef.current);
    }, delay);
  }

  function scheduleZoomFrame() {
    if (zoomFrame.current === null) {
      zoomFrame.current = requestAnimationFrame(applyPendingZoom);
    }
  }

  /**
   * Zoom towards a point in client coordinates, or the centre of the view
   * when none is given. Keeping whatever is under the pointer under the
   * pointer is the whole trick: zoom that pulls towards a corner makes a
   * big board impossible to navigate.
   */
  function zoomAt(next: number, clientX?: number, clientY?: number) {
    const el = scroller.current;
    if (!el) return;
    const to = clampZoom(next);
    if (to === targetZoomRef.current) return;

    const box = el.getBoundingClientRect();
    anchorRef.current = {
      x: (clientX ?? box.left + box.width / 2) - box.left,
      y: (clientY ?? box.top + box.height / 2) - box.top,
    };
    targetZoomRef.current = to;
    scheduleZoomFrame();
    commitZoom();
  }

  // Establish the three camera variables before the first paint. Afterwards
  // they are mutated together by `applyPendingZoom` and never by React.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.style.setProperty("--canvas-zoom", "1");
    el.style.setProperty("--canvas-scaled-width", `${world.width}px`);
    el.style.setProperty("--canvas-scaled-height", `${world.height}px`);
  }, [scroller, world.height, world.width]);

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
        commitZoom(0);
      }
    };

    const onWheel = (event: WheelEvent) => {
      // The plane is navigated by grabbing it, so every wheel or two-finger
      // trackpad gesture is free to be zoom. Horizontal-only trackpad input
      // uses its horizontal delta rather than becoming a dead gesture.
      event.preventDefault();
      const pixels = wheelDeltaPixels(
        event.deltaX,
        event.deltaY,
        event.deltaMode,
        el.clientHeight
      );
      zoomAtRef.current?.(
        zoomAfterWheel(targetZoomRef.current, pixels, event.ctrlKey || event.metaKey),
        event.clientX,
        event.clientY
      );
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

  useEffect(
    () => () => {
      if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current);
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    },
    []
  );

  return { zoom, panning, resetZoom };
}
