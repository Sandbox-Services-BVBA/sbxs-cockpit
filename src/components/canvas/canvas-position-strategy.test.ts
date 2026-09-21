import { describe, expect, it } from "vitest";
import { createCanvasPositionStrategy } from "./canvas-position-strategy";

describe("canvas position strategy", () => {
  it("scales pointer deltas without replacing the parent-relative drag start", () => {
    const strategy = createCanvasPositionStrategy(0.6);

    expect(strategy.type).toBe("transform");
    expect(strategy.scale).toBe(0.6);
    expect(strategy.calcDragPosition).toBeUndefined();
  });
});
