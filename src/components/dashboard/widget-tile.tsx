"use client";

import { useId, type KeyboardEvent } from "react";
import { SIZE_SPANS, type WidgetSize } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";

interface WidgetTileProps {
  title?: string;
  size?: WidgetSize;
  className?: string;
  /** Extra classes on the scrolling body, for a pane that fills instead. */
  bodyClassName?: string;
  headerRight?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * The panel every widget draws inside.
 *
 * Two rules make the canvas work. First, the tile fills the height it is
 * given rather than growing to fit its contents: on a board where Bob sets
 * the height by dragging a corner, a widget that decides its own height
 * would tear the arrangement apart every time a list got longer. Second,
 * the body scrolls on its own, so a list of forty crons is forty scrollable
 * rows inside a tile the same height as its neighbours, not a column that
 * pushes everything below it off the plane.
 *
 * `@container` makes the tile the query root, so widgets lay themselves out
 * against the width of the tile they are in, not the width of the window.
 * That is what lets the same widget read at three columns and at twelve.
 */
export function WidgetTile({
  title,
  size = "sm",
  className,
  bodyClassName,
  headerRight,
  onClick,
  children,
}: WidgetTileProps) {
  const titleId = useId();
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div
      role={onClick ? "button" : "region"}
      tabIndex={onClick ? 0 : undefined}
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        "cockpit-panel @container flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        onClick && "cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
        SIZE_SPANS[size],
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      {title && (
        <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border/65 px-4 py-2.5">
          <h3 id={titleId} className="truncate text-tiny font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
          {headerRight}
        </div>
      )}
      <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3.5", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}
