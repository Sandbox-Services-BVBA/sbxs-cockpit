"use client";

import { useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { ModuleDensity } from "@/lib/layout/types";
import type { CronJob } from "@/types";
import { cutByDensity, foldLabel } from "../infra/density";
import { DensityFold } from "../infra/density-fold";

const statusDot: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  unknown: "bg-zinc-500",
};

export function CronsWidget({
  crons,
  density = "standard",
}: {
  crons: CronJob[];
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (crons.length === 0) {
    return (
      <WidgetTile title="Cron Jobs" size="md">
        <p className="text-xs text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  const okCount = crons.filter((c) => c.status === "ok").length;
  const cut = cutByDensity(crons, density, (c) => c.status === "ok", expanded);

  return (
    <WidgetTile
      title="Cron Jobs"
      size="md"
      headerRight={<span className="text-tiny text-muted-foreground">{okCount}/{crons.length}</span>}
    >
      {cut.rows.length > 0 && (
        <div className="space-y-2">
          {cut.rows.map((c) => (
            <div key={`${c.server_name}-${c.cron_name}`} className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5  shrink-0", statusDot[c.status])} />
              <span className="text-xs truncate flex-1">{c.cron_name}</span>
              <span className="text-tiny text-muted-foreground whitespace-nowrap">
                {c.last_run_at ? formatDistanceToNow(new Date(c.last_run_at), { addSuffix: true }) : "never"}
              </span>
            </div>
          ))}
        </div>
      )}
      {cut.fold && (
        <DensityFold
          label={foldLabel(cut, "job", "on schedule")}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </WidgetTile>
  );
}
