"use client";

import { Ellipsis, GripVertical, Lock, Maximize2, X } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { ModuleDensity, ResolvedModule } from "@/lib/layout/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The controls that belong to a tile rather than to the widget inside it:
// the grip, the menu and the close. They float over the card's top-right
// corner and appear on hover, focus or selection, rather than occupying a
// strip of their own above it. Two reasons: the tile and the card are then
// the same box, so a resize handle lands on the card's own edge, and the
// title is printed once, by the card, instead of twice.
//
// Size is not in the menu, because the tile is resized by dragging its edge.
// What is left is the things a drag cannot express.

export const DENSITY_LABELS: Record<ModuleDensity, string> = {
  summary: "Summary",
  standard: "Standard",
  full: "Everything",
};

export interface TileChromeProps {
  resolved: ResolvedModule;
  /** Move by whole cells. The caller refuses a move into occupied space. */
  onNudge: (dx: number, dy: number) => void;
  /** Grow or shrink by whole cells, same refusal. */
  onResize: (dw: number, dh: number) => void;
  onResetSize: () => void;
  onClose: () => void;
  onDensity: (density: ModuleDensity) => void;
  /** Click the grip to select the tile; hold shift or meta to add to a selection. */
  onSelect: (additive: boolean) => void;
  /** Focus anchors, so a keyboard change lands back on the control that made it. */
  gripRef: (el: HTMLElement | null) => void;
  menuRef: (el: HTMLElement | null) => void;
}

const DELTAS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function TileChrome({
  resolved,
  onNudge,
  onResize,
  onResetSize,
  onClose,
  onDensity,
  onSelect,
  gripRef,
  menuRef,
}: TileChromeProps) {
  const { definition, density } = resolved;
  const title = definition.title;
  const hasDensity = definition.allowedDensities.length > 1;
  const required = definition.required === true;

  // Clicking the grip selects the tile, but neither a click handler nor a
  // pointerup handler on the grip ever fires: the drag layer takes pointer
  // capture on pointerdown, so everything after that is delivered to the
  // capturing element instead. The release is therefore caught on the
  // window, where a captured event still bubbles.
  const onGripDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const from = { x: event.clientX, y: event.clientY };
    const onUp = (up: globalThis.PointerEvent) => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      // Further than a few pixels was a drag, and a drag is a move.
      if (Math.abs(up.clientX - from.x) + Math.abs(up.clientY - from.y) > 4) return;
      onSelect(up.shiftKey || up.metaKey || up.ctrlKey);
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // The grip is the drag handle and the keyboard handle in one: an arrow
  // moves the tile a cell, shift and an arrow resizes it by a cell. Focus
  // stays on the grip, so a run of arrows keeps going.
  const onGripKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = DELTAS[event.key];
    if (!delta) return;
    event.preventDefault();
    const [dx, dy] = delta;
    if (event.shiftKey) onResize(dx, dy);
    else onNudge(dx, dy);
  };

  return (
    <div className="canvas-tile__bar">
      <button
        type="button"
        ref={gripRef}
        className="canvas-tile__grip"
        aria-label={`${title}: drag to move, arrow keys to move a cell, shift and arrow keys to resize`}
        title="Click to select, drag to move. Arrow keys move, shift and arrows resize."
        onKeyDown={onGripKey}
        onPointerDown={onGripDown}
      >
        <GripVertical className="canvas-tile__grip-icon" aria-hidden="true" />
      </button>

      <div className="canvas-tile__actions">
        <DropdownMenu>
          <DropdownMenuTrigger ref={menuRef} className="canvas-tile__btn" aria-label={`${title} options`}>
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="canvas-menu">
            {hasDensity && (
              <>
                {/* Base UI requires a group label to sit inside a group. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Detail</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={density}
                    onValueChange={(value) => onDensity(value as ModuleDensity)}
                  >
                    {definition.allowedDensities.map((option) => (
                      <DropdownMenuRadioItem key={option} value={option} closeOnClick>
                        {DENSITY_LABELS[option]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem onClick={onResetSize}>
              <Maximize2 aria-hidden="true" />
              Reset size
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            {required ? (
              <DropdownMenuItem disabled>
                <Lock aria-hidden="true" />
                Always shown
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onClick={onClose}>
                <X aria-hidden="true" />
                Close
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {required ? (
          // No X on a required tile. The lock is focusable so the reason is
          // read out on focus as well as shown on hover.
          <span
            className="canvas-tile__btn canvas-tile__lock"
            role="img"
            tabIndex={0}
            aria-label={`${title} is always shown and cannot be closed`}
            title={`${title} is always shown and cannot be closed`}
          >
            <Lock aria-hidden="true" />
          </span>
        ) : (
          <button
            type="button"
            className="canvas-tile__btn canvas-tile__close"
            aria-label={`Close ${title}`}
            title="Close"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
