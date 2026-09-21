// RGL's createScaledStrategy calculates a drag's starting point from viewport
// coordinates. That is wrong for this board: the grid lives inside a scroller,
// so a scrolled tile jumps toward the top-left the moment dragging starts.
//
// DraggableCore already divides pointer deltas by PositionStrategy.scale. By
// retaining the ordinary transform strategy without calcDragPosition, RGL
// keeps its parent-relative start calculation and still handles zoomed deltas.

import { transformStrategy, type PositionStrategy } from "react-grid-layout/core";

export function createCanvasPositionStrategy(scale: number): PositionStrategy {
  return { ...transformStrategy, scale };
}
