"use client";

import { useCallback, useEffect, useRef } from "react";
import Sortable from "sortablejs";

// SortableJS against the grid container, imperatively. There is no React
// wrapper in between because the only thing SortableJS may own is the
// gesture: when a drop lands, its DOM move is undone and the new order is
// committed to React state instead. React then performs the same move
// through reconciliation, so the tree it believes in and the tree on
// screen never disagree. Skipping the revert is how you get a tile that
// renders twice or vanishes after the next state update.

export const GRIP_SELECTOR = ".canvas-tile__grip";

export interface SortableDrop {
  moduleId: string;
  /** The tile the dropped one now sits in front of, or null for last. */
  beforeId: string | null;
}

export function useSortableGrid(onDrop: (drop: SortableDrop) => void) {
  const sortable = useRef<Sortable | null>(null);
  // The latest handler, so the one-time Sortable instance never calls a
  // stale closure.
  const handler = useRef(onDrop);
  useEffect(() => {
    handler.current = onDrop;
  }, [onDrop]);

  // A callback ref rather than an effect: the grid mounts after the profile
  // has loaded, some renders later than the view, and Strict Mode mounts it
  // twice. Either way the instance follows the element.
  return useCallback((el: HTMLElement | null) => {
    sortable.current?.destroy();
    sortable.current = null;
    if (!el) return;

    sortable.current = Sortable.create(el, {
      handle: GRIP_SELECTOR,
      animation: 150,
      // On a phone a finger on the grip is a scroll until it has held still
      // for a moment. Any movement inside the delay cancels the drag, so a
      // scroll gesture never picks a tile up by accident.
      delay: 180,
      delayOnTouchOnly: true,
      touchStartThreshold: 4,
      ghostClass: "canvas-tile--ghost",
      chosenClass: "canvas-tile--chosen",
      dragClass: "canvas-tile--drag",
      // Mixed spans: a full-width tile next to a compact one has very
      // different geometry, so decide by the centre of the pointer rather
      // than by a swap zone that assumes equal boxes.
      swapThreshold: 0.65,
      invertSwap: true,
      onEnd(event) {
        const { item, from, oldIndex, newIndex } = event;
        if (oldIndex === undefined || newIndex === undefined) return;
        const moduleId = item.dataset.moduleId;
        // Read the landing spot before undoing the move.
        const next = item.nextElementSibling as HTMLElement | null;
        const beforeId = next?.dataset.moduleId ?? null;

        // Put the DOM back exactly as React left it.
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);

        if (moduleId && oldIndex !== newIndex) handler.current({ moduleId, beforeId });
      },
    });
  }, []);
}
