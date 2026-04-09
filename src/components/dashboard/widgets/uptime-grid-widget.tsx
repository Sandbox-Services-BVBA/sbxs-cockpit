"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { UptimeCheck } from "@/types";

function UptimeTracker({ checks }: { checks: UptimeCheck[] }) {
  const display = checks.slice(0, 24).reverse();
  if (display.length === 0) return null;

  return (
    <div className="flex gap-px">
      {display.map((c, i) => (
        <div
          key={i}
          className={cn("h-3 flex-1 min-w-[3px]", c.is_up ? "bg-[#33aa55]" : "bg-[#ff4444]")}
          title={`${c.checked_at}: ${c.is_up ? "up" : "down"} (${c.response_time_ms}ms)`}
        />
      ))}
    </div>
  );
}

function UptimeRow({ check, history }: { check: UptimeCheck; history: UptimeCheck[] }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0", check.is_up ? "bg-[#33aa55]" : "bg-[#ff4444] animate-pulse")} />
        <span className="text-[11px] font-bold truncate flex-1">{check.site_name}</span>
        <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground">
          {check.response_time_ms !== null && <span>{check.response_time_ms}ms</span>}
          {check.ssl_days_remaining !== null && (
            <span className={cn(check.ssl_days_remaining <= 14 && "text-[#ccaa33]")}>
              SSL {check.ssl_days_remaining}d
            </span>
          )}
        </div>
      </div>
      <UptimeTracker checks={history} />
    </div>
  );
}

export function UptimeGridWidget({ uptime, uptimeHistory }: { uptime: UptimeCheck[]; uptimeHistory?: UptimeCheck[] }) {
  if (uptime.length === 0) {
    return (
      <WidgetTile title="Uptime Monitor" size="lg">
        <p className="text-[11px] text-muted-foreground">No uptime data yet</p>
      </WidgetTile>
    );
  }

  const upCount = uptime.filter((u) => u.is_up).length;
  const allUp = upCount === uptime.length;

  return (
    <WidgetTile
      title="Uptime Monitor"
      size="lg"
      headerRight={
        <span className={cn("text-[9px] font-mono", allUp ? "text-[#33aa55]" : "text-[#ff4444]")}>
          {upCount}/{uptime.length} online
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {uptime.map((u) => (
          <UptimeRow
            key={u.site_url}
            check={u}
            history={(uptimeHistory || []).filter((h) => h.site_url === u.site_url)}
          />
        ))}
      </div>
    </WidgetTile>
  );
}
