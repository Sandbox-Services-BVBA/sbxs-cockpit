"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SIZE_SPANS, type WidgetSize } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";

interface WidgetTileProps {
  title?: string;
  size?: WidgetSize;
  compact?: boolean;
  className?: string;
  headerRight?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}

export function WidgetTile({
  title,
  size = "sm",
  compact = false,
  className,
  headerRight,
  onClick,
  children,
}: WidgetTileProps) {
  return (
    <Card
      className={cn(
        "bg-card/80 backdrop-blur border-border/50 transition-all",
        onClick && "cursor-pointer hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        SIZE_SPANS[size],
        className
      )}
      onClick={onClick}
    >
      {title && (
        <CardHeader className={cn("pb-0", compact ? "px-3 pt-2.5" : "px-4 pt-3")}>
          <div className="flex items-center justify-between">
            <h3 className={cn("font-semibold text-muted-foreground tracking-wide uppercase", compact ? "text-[10px]" : "text-xs")}>{title}</h3>
            {headerRight}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(compact ? "px-3 py-2" : "px-4 py-3")}>
        {children}
      </CardContent>
    </Card>
  );
}
