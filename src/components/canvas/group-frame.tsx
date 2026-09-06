"use client";

import { Ellipsis, Palette, Ungroup } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  CANVAS_COL_PITCH,
  CANVAS_ROW_PITCH,
  tileHeightPx,
  tileLeftPx,
  tileTopPx,
  tileWidthPx,
} from "@/lib/layout/grid";
import type { ResolvedGroup } from "@/lib/layout/types";
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

// A group is a border and a name around tiles that belong together. It owns
// no geometry of its own: the frame is always the bounding box of whatever
// its members currently are, so it cannot drift out of agreement with the
// board, and a member that is closed or dragged away simply changes the
// shape. Drawn behind the tiles, never over them.

/** Breathing room between the members and the border, in pixels. */
const FRAME_PAD = 9;
/** Room reserved above the members for the label, inside the border. */
const FRAME_HEAD = 26;

export const GROUP_TONE_NAMES = ["Teal", "Coral", "Amber", "Violet", "Blue", "Green"];

export interface GroupFrameProps {
  group: ResolvedGroup;
  /** The plane's scale, so a pointer delta can be read back as cells. */
  zoom: number;
  /** Called once when the drag begins, to snapshot where the members are. */
  onMoveStart: () => void;
  /**
   * The whole-cell offset from where the drag began, not a step. The window
   * listeners below are created once per gesture and keep the props they
   * were given, so anything relative to "now" would be measured against a
   * base that stopped updating the moment the drag started.
   */
  onMoveTo: (dx: number, dy: number) => void;
  onRename: (name: string) => void;
  onTone: (tone: number) => void;
  onUngroup: () => void;
}

export function GroupFrame({ group, zoom, onMoveStart, onMoveTo, onRename, onTone, onUngroup }: GroupFrameProps) {
  const [renaming, setRenaming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) input.current?.select();
  }, [renaming]);

  const { rect } = group;
  // The label lives inside the border, in a strip of its own above the
  // members, rather than straddling the top edge: the frame is painted
  // behind the tiles, so a label sitting on the edge would be half covered
  // by whatever tile happens to be in the row above.
  const style = {
    left: tileLeftPx(rect.x) - FRAME_PAD,
    top: tileTopPx(rect.y) - FRAME_PAD - FRAME_HEAD,
    width: tileWidthPx(rect.w) + FRAME_PAD * 2,
    height: tileHeightPx(rect.h) + FRAME_PAD * 2 + FRAME_HEAD,
  };

  // Dragging the label drags the whole group. Deltas arrive in screen pixels
  // and the plane may be scaled, so they are divided by the zoom before
  // being read back as cells; without that a group moves at the wrong speed
  // the moment Bob is not at 100 percent.
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || renaming) return;
    event.preventDefault();
    event.stopPropagation();
    const from = { x: event.clientX, y: event.clientY };
    let last = { dx: 0, dy: 0 };
    setDragging(true);
    onMoveStart();

    const onMove = (move: PointerEvent) => {
      const dx = Math.round((move.clientX - from.x) / zoom / CANVAS_COL_PITCH);
      const dy = Math.round((move.clientY - from.y) / zoom / CANVAS_ROW_PITCH);
      if (dx === last.dx && dy === last.dy) return;
      last = { dx, dy };
      onMoveTo(dx, dy);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const commitName = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (name && name !== group.name) onRename(name);
  };

  return (
    <div
      className="canvas-group"
      data-tone={group.tone}
      data-dragging={dragging || undefined}
      style={style}
      aria-hidden="true"
    >
      <div className="canvas-group__bar">
        {renaming ? (
          <input
            ref={input}
            className="canvas-group__input"
            defaultValue={group.name}
            onBlur={(event) => commitName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitName(event.currentTarget.value);
              if (event.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="canvas-group__handle"
            onPointerDown={startDrag}
            onDoubleClick={() => setRenaming(true)}
            title="Drag to move the group. Double click to rename."
          >
            {group.name}
            <span className="canvas-group__count">{group.moduleIds.length}</span>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="canvas-group__btn" aria-label={`${group.name} group options`}>
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="canvas-menu">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Colour</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={String(group.tone)}
                onValueChange={(value) => onTone(Number(value))}
              >
                {GROUP_TONE_NAMES.map((label, tone) => (
                  <DropdownMenuRadioItem key={label} value={String(tone)} closeOnClick>
                    <Palette aria-hidden="true" data-tone={tone} className="canvas-group__swatch" />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onUngroup}>
              <Ungroup aria-hidden="true" />
              Ungroup
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
