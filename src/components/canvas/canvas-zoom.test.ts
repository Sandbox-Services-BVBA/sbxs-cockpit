import { describe, expect, it } from "vitest";
import { anchoredZoomScroll } from "./canvas-zoom";

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
});
