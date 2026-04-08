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
        "rounded-lg border border-border/50 bg-card/80 backdrop-blur",
        onClick && "cursor-pointer hover:border-primary/30",
        SIZE_SPANS[size],
        className
      )}
      onClick={onClick}
    >
      {title && (
        <div className="flex items-center justify-between px-2.5 pt-2 pb-0">
          <h3 className="text-[10px] font-semibold text-muted-foreground tracking-wide uppercase">{title}</h3>
          {headerRight}
        </div>
      )}
      <div className="px-2.5 py-2">
        {children}
      </div>
    </div>
  );
}
