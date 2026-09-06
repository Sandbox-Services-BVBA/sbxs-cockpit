"use client";

import { ArrowDown, ArrowUp, Ellipsis, GripVertical, Lock, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { ModuleDensity, ModuleWidth, ResolvedModule } from "@/lib/layout/types";
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

// The strip above every tile: the grip on the left, the menu and the close
// on the right. It is the only chrome the canvas adds; the module below it
// keeps drawing its own header. Everything a settings screen used to hold
// (width, density, order, visibility) is reachable from here without
// leaving the page.

export const WIDTH_LABELS: Record<ModuleWidth, string> = {
  compact: "Compact",
  standard: "Standard",
  wide: "Wide",
  full: "Full width",
};

export const DENSITY_LABELS: Record<ModuleDensity, string> = {
  summary: "Summary",
  standard: "Standard",
  full: "Everything",
};

export interface TileChromeProps {
  resolved: ResolvedModule;
  /** Position among the visible tiles, for the disabled state of Move up/down. */
  index: number;
  count: number;
  /** `source` says which control asked, so focus can return to it. */
  onMove: (delta: number, source: "grip" | "menu") => void;
  onClose: () => void;
  onWidth: (width: ModuleWidth) => void;
  onDensity: (density: ModuleDensity) => void;
  /** Focus anchors, so a keyboard move lands back on the control that made it. */
  gripRef: (el: HTMLElement | null) => void;
  menuRef: (el: HTMLElement | null) => void;
}

export function TileChrome({
  resolved,
  index,
  count,
  onMove,
  onClose,
  onWidth,
  onDensity,
  gripRef,
  menuRef,
}: TileChromeProps) {
  const { definition, width, density } = resolved;
  const title = definition.title;
  const first = index === 0;
  const last = index === count - 1;
  const hasDensity = definition.allowedDensities.length > 1;
  const required = definition.required === true;

  // The grip is also the keyboard path: focus it and an arrow moves the tile
  // one place, with focus staying on the grip so the next arrow keeps going.
  const onGripKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    onMove(delta, "grip");
  };

  return (
    <div className="canvas-tile__bar">
      <button
        type="button"
        ref={gripRef}
        className="canvas-tile__grip"
        aria-label={`${title}: drag to move, or press an arrow key`}
        title="Drag to move, or use the arrow keys"
        onKeyDown={onGripKey}
      >
        <GripVertical className="canvas-tile__grip-icon" aria-hidden="true" />
        <span className="canvas-tile__name">{title}</span>
      </button>

      <div className="canvas-tile__actions">
        <DropdownMenu>
          <DropdownMenuTrigger ref={menuRef} className="canvas-tile__btn" aria-label={`${title} options`}>
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="canvas-menu">
            {/* Base UI requires a group label to sit inside a group. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Width</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={width} onValueChange={(value) => onWidth(value as ModuleWidth)}>
                {definition.allowedWidths.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option} closeOnClick>
                    {WIDTH_LABELS[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>

            {hasDensity && (
              <>
                <DropdownMenuSeparator />
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
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={first} onClick={() => onMove(-1, "menu")}>
              <ArrowUp aria-hidden="true" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onClick={() => onMove(1, "menu")}>
              <ArrowDown aria-hidden="true" />
              Move down
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
