"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./status-indicator";
import { Timer } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CronJob } from "@/types";

function CronRow({ cron }: { cron: CronJob }) {
  const lastRun = cron.last_run_at
    ? formatDistanceToNow(new Date(cron.last_run_at), { addSuffix: true })
    : "Never";

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="space-y-0.5 min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{cron.cron_name}</p>
        <p className="text-xs text-muted-foreground">
          {cron.server_name} &middot; {cron.schedule_human || cron.schedule}
        </p>
        {cron.output_snippet && (
          <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">
            {cron.output_snippet}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 ml-4">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{lastRun}</span>
        <StatusBadge status={cron.status} />
      </div>
    </div>
  );
}

export function CronStatusSection({ crons }: { crons: CronJob[] }) {
  if (crons.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Timer className="h-5 w-5" /> Cron Jobs
        </h2>
        <Card className="bg-card/50">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No cron data yet. Waiting for cockpit-agent...
          </CardContent>
        </Card>
      </section>
    );
  }

  const okCount = crons.filter((c) => c.status === "ok").length;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Timer className="h-5 w-5" /> Cron Jobs
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {okCount}/{crons.length} healthy
        </span>
      </h2>
      <Card className="bg-card/50 backdrop-blur">
        <CardContent className="pt-4">
          {crons.map((c) => (
            <CronRow key={`${c.server_name}-${c.cron_name}`} cron={c} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
