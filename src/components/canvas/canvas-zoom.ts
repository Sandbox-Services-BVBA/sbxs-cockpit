export interface ScrollPoint {
  left: number;
  top: number;
}

export interface PointerPoint {
  x: number;
  y: number;
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
