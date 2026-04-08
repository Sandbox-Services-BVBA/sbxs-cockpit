"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { UptimeCheck } from "@/types";

function UptimeDot({ check }: { check: UptimeCheck }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={cn("h-2 w-2  shrink-0", check.is_up ? "bg-emerald-500" : "bg-red-500 animate-pulse")} />
      <span className="text-xs truncate flex-1">{check.site_name}</span>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {check.response_time_ms !== null && <span>{check.response_time_ms}ms</span>}
        {check.ssl_days_remaining !== null && (
          <span className={cn(check.ssl_days_remaining <= 14 && "text-amber-400", check.ssl_days_remaining <= 7 && "text-red-400")}>
            SSL {check.ssl_days_remaining}d
          </span>
        )}
      </div>
    </div>
  );
}

export function UptimeGridWidget({ uptime }: { uptime: UptimeCheck[] }) {
  if (uptime.length === 0) {
    return (
      <WidgetTile title="Uptime Monitor" size="lg">
        <p className="text-xs text-muted-foreground">No uptime data yet</p>
      </WidgetTile>
    );
  }

  const allUp = uptime.every((u) => u.is_up);
  const upCount = uptime.filter((u) => u.is_up).length;

  return (
    <WidgetTile
      title="Uptime Monitor"
      size="lg"
      headerRight={
        <span className={cn("text-[10px] font-medium", allUp ? "text-emerald-400" : "text-red-400")}>
          {upCount}/{uptime.length} online
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4">
        {uptime.map((u) => (
          <UptimeDot key={u.site_url} check={u} />
        ))}
      </div>
    </WidgetTile>
  );
}
