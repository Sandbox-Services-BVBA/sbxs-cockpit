export interface ScrollPoint {
  left: number;
  top: number;
}

export interface PointerPoint {
  x: number;
  y: number;
}

/** Trackpads can report several tiny wheel events inside one paint. */
export const WHEEL_ZOOM_SETTLE_MS = 90;

/**
 * Convert browser wheel units to pixels. Keeping this outside the gesture
 * hook makes mouse wheels and high-resolution trackpads follow one curve.
 */
export function wheelDeltaPixels(
  deltaX: number,
  deltaY: number,
  deltaMode: number,
  pageHeight: number
): number {
  const raw = deltaY || deltaX;
  if (deltaMode === 1) return raw * 16;
  if (deltaMode === 2) return raw * pageHeight;
  return raw;
}

/**
 * A gentler curve for ordinary two-finger scrolling, with a tighter cap for
 * physical mouse wheels. Browser-native trackpad pinch already reports very
 * small ctrl-wheel deltas and therefore uses a little more gain.
 */
export function zoomAfterWheel(current: number, pixels: number, pinch: boolean): number {
  const limit = pinch ? 40 : 80;
  const divisor = pinch ? 360 : 900;
  const bounded = Math.max(-limit, Math.min(limit, pixels));
  return current * Math.exp(-bounded / divisor);
}

/**
 * Scroll position that keeps the same world point below the pointer while
 * the world changes scale.
 */
export function anchoredZoomScroll(
  scroll: ScrollPoint,
  pointer: PointerPoint,
  fromZoom: number,
  toZoom: number
): ScrollPoint {
  const worldX = (scroll.left + pointer.x) / fromZoom;
  const worldY = (scroll.top + pointer.y) / fromZoom;
  return {
    left: worldX * toZoom - pointer.x,
    top: worldY * toZoom - pointer.y,
  };
}
