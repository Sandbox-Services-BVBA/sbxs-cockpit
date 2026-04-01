"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StatusDot, MetricValue } from "./status-indicator";
import { Globe, ShieldCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UptimeCheck } from "@/types";

function UptimeTracker({ checks }: { checks: UptimeCheck[] }) {
  // Show last 48 checks as small colored blocks
  const display = checks.slice(0, 48).reverse();
  if (display.length === 0) return null;

  return (
    <div className="flex gap-0.5">
      {display.map((c, i) => (
        <div
          key={i}
          className={cn(
            "h-6 w-1.5 rounded-full transition-colors",
            c.is_up ? "bg-emerald-500/80" : "bg-red-500/80"
          )}
          title={`${c.checked_at}: ${c.is_up ? "up" : "down"} (${c.response_time_ms}ms)`}
        />
      ))}
    </div>
  );
}

function UptimeCard({ check, history }: { check: UptimeCheck; history: UptimeCheck[] }) {
  const uptimePercent = history.length > 0
    ? ((history.filter((h) => h.is_up).length / history.length) * 100).toFixed(1)
    : "---";

  return (
    <Card className="bg-card/50 backdrop-blur">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot status={check.is_up ? "up" : "down"} size="md" />
            <span className="text-sm font-medium">{check.site_name}</span>
          </div>
          <MetricValue value={uptimePercent} unit="%" size="sm" />
        </div>

        <UptimeTracker checks={history} />

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {check.response_time_ms !== null && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {check.response_time_ms}ms
            </div>
          )}
          {check.ssl_days_remaining !== null && (
            <div className={cn(
              "flex items-center gap-1",
              check.ssl_days_remaining <= 14 && "text-amber-400",
              check.ssl_days_remaining <= 7 && "text-red-400",
            )}>
              <ShieldCheck className="h-3 w-3" />
              SSL {check.ssl_days_remaining}d
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground truncate">{check.site_url}</p>
      </CardContent>
    </Card>
  );
}

export function UptimeSection({
  uptime,
  uptimeHistory,
}: {
  uptime: UptimeCheck[];
  uptimeHistory: UptimeCheck[];
}) {
  if (uptime.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5" /> Uptime
        </h2>
        <Card className="bg-card/50">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No uptime data yet. Trigger a check at /api/uptime/check
          </CardContent>
        </Card>
      </section>
    );
  }

  const allUp = uptime.every((u) => u.is_up);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Globe className="h-5 w-5" /> Uptime
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {uptime.filter((u) => u.is_up).length}/{uptime.length} online
        </span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {uptime.map((u) => (
          <UptimeCard
            key={u.site_url}
            check={u}
            history={uptimeHistory.filter((h) => h.site_url === u.site_url)}
          />
        ))}
      </div>
    </section>
  );
}
