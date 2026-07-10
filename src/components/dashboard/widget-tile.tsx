"use client";

import { useId, type KeyboardEvent } from "react";
import { SIZE_SPANS, type WidgetSize } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";

interface WidgetTileProps {
  title?: string;
  size?: WidgetSize;
  className?: string;
  headerRight?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}

export function WidgetTile({
  title,
  size = "sm",
  className,
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
        "cockpit-panel min-w-0 overflow-hidden",
        onClick && "cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
        SIZE_SPANS[size],
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      {title && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/65 px-4 py-2.5">
          <h3 id={titleId} className="text-tiny font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
          {headerRight}
        </div>
      )}
      <div className="px-4 py-3.5">
        {children}
      </div>
    </div>
  );
}
