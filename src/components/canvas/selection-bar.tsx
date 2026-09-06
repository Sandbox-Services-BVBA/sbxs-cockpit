"use client";

import { Group, X } from "lucide-react";

// What appears once tiles are selected. It is the only thing on the board
// that is modal, and only just: pick tiles, name what they are together,
// or drop the selection. Nothing else changes while it is up.

export interface SelectionBarProps {
  count: number;
  onGroup: () => void;
  onClear: () => void;
}

export function SelectionBar({ count, onGroup, onClear }: SelectionBarProps) {
  if (count === 0) return null;
  return (
    <div className="canvas-selection" role="status">
      <span className="canvas-selection__count">
        {count} {count === 1 ? "widget" : "widgets"} selected
      </span>
      <button type="button" className="canvas-selection__action" onClick={onGroup} disabled={count < 2}>
        <Group aria-hidden="true" />
        Group
      </button>
      <button type="button" className="canvas-selection__clear" onClick={onClear} aria-label="Clear selection">
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
