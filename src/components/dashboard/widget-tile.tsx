"use client";

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
  return (
    <div
      className={cn(
        "border-2 border-border bg-card",
        onClick && "cursor-pointer hover:border-primary",
        SIZE_SPANS[size],
        className
      )}
      onClick={onClick}
    >
      {title && (
        <div className="flex items-center justify-between px-2 pt-1.5 pb-0">
          <h3 className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">{title}</h3>
          {headerRight}
        </div>
      )}
      <div className="px-2 py-1.5">
        {children}
      </div>
    </div>
  );
}
