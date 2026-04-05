"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { CronJob } from "@/types";

const statusDot: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  unknown: "bg-zinc-500",
};

export function CronsWidget({ crons }: { crons: CronJob[] }) {
  if (crons.length === 0) {
    return (
      <WidgetTile title="Cron Jobs" size="md">
        <p className="text-xs text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  const okCount = crons.filter((c) => c.status === "ok").length;

  return (
    <WidgetTile
      title="Cron Jobs"
      size="md"
      headerRight={<span className="text-[10px] text-muted-foreground">{okCount}/{crons.length}</span>}
    >
      <div className="space-y-2">
        {crons.map((c) => (
          <div key={`${c.server_name}-${c.cron_name}`} className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot[c.status])} />
            <span className="text-xs truncate flex-1">{c.cron_name}</span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {c.last_run_at ? formatDistanceToNow(new Date(c.last_run_at), { addSuffix: true }) : "never"}
            </span>
          </div>
        ))}
      </div>
    </WidgetTile>
  );
}
