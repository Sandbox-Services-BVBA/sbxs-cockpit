import { describe, expect, it } from "vitest";
import { anchoredZoomScroll, wheelDeltaPixels, zoomAfterWheel } from "./canvas-zoom";

describe("anchored canvas zoom", () => {
  it("keeps the world point below the pointer fixed", () => {
    const pointer = { x: 320, y: 180 };
    const before = { left: 8_000, top: 5_000 };
    const after = anchoredZoomScroll(before, pointer, 1, 0.3);

    expect((before.left + pointer.x) / 1).toBeCloseTo((after.left + pointer.x) / 0.3);
    expect((before.top + pointer.y) / 1).toBeCloseTo((after.top + pointer.y) / 0.3);
  });

  it("can chain wheel events before the browser has painted", () => {
    const pointer = { x: 500, y: 300 };
    const first = anchoredZoomScroll({ left: 12_000, top: 9_000 }, pointer, 1, 0.8);
    const second = anchoredZoomScroll(first, pointer, 0.8, 0.6);
    const direct = anchoredZoomScroll({ left: 12_000, top: 9_000 }, pointer, 1, 0.6);

    expect(second).toEqual(direct);
  });

  it("normalizes pixel, line and page wheel units", () => {
    expect(wheelDeltaPixels(0, 4, 0, 800)).toBe(4);
    expect(wheelDeltaPixels(0, 4, 1, 800)).toBe(64);
    expect(wheelDeltaPixels(0, 1, 2, 800)).toBe(800);
    expect(wheelDeltaPixels(3, 0, 0, 800)).toBe(3);
  });

  it("keeps small trackpad deltas precise and caps coarse wheel steps", () => {
    const tiny = zoomAfterWheel(1, 3, false);
    const coarse = zoomAfterWheel(1, 800, false);

    expect(tiny).toBeGreaterThan(0.99);
    expect(coarse).toBeCloseTo(zoomAfterWheel(1, 80, false));
    expect(zoomAfterWheel(1, 3, true)).toBeLessThan(tiny);
  });
});
