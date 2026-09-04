"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { cutAlerts } from "@/lib/alerts-density";
import type { ModuleDensity } from "@/lib/layout/types";
import type { Alert } from "@/types";
import { DensityFold } from "../infra/density-fold";

function age(alert: Alert): string {
  return formatDistanceToNow(new Date(alert.created_at), { addSuffix: true });
}

export function AlertsSummaryWidget({
  alerts,
  density = "standard",
  suppressHealthy = false,
}: {
  alerts: Alert[];
  density?: ModuleDensity;
  suppressHealthy?: boolean;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) {
    if (suppressHealthy) return null;
    return (
      <div className="col-span-full flex items-center gap-3 rounded-xl border border-emerald-600/25 bg-emerald-600/[0.07] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-emerald-600" />
        <span className="text-petite font-bold text-emerald-800 dark:text-emerald-200">All monitored systems are operational</span>
      </div>
    );
  }

  // Criticals are printed at every density; see lib/alerts-density.ts.
  const cut = cutAlerts(alerts, density, expanded);

  return (
    <div className="col-span-full space-y-2">
      {cut.criticals.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-red-600/35 bg-red-600/[0.08] px-4 py-3 text-red-900 dark:text-red-100">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-600 motion-safe:animate-pulse" />
          <span className="min-w-0 flex-1 truncate text-petite font-bold">
            {a.source}: {a.message}
          </span>
          <span className="shrink-0 font-mono text-mini text-red-800/60 dark:text-red-200/60">{age(a)}</span>
        </div>
      ))}

      {cut.itemized
        ? cut.warnings.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border border-amber-600/30 bg-amber-500/[0.08] px-4 py-3 text-amber-900 dark:text-amber-100">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-600" />
              <span className="min-w-0 flex-1 truncate text-petite">
                <b>{a.source}</b>: {a.message}
              </span>
              <span className="shrink-0 font-mono text-mini text-amber-800/60 dark:text-amber-200/60">{age(a)}</span>
            </div>
          ))
        : cut.warnings.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-600/30 bg-amber-500/[0.08] px-4 py-3 text-amber-900 dark:text-amber-100">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-600" />
              <span className="min-w-0 flex-1 truncate text-petite">
                <b>{cut.warnings.length}</b> warning{cut.warnings.length > 1 ? "s" : ""}: {cut.warnings.map((w) => w.source).join(", ")}
              </span>
            </div>
          )}

      {cut.fold && (
        <DensityFold
          label={`${cut.healthy} warning${cut.healthy === 1 ? "" : "s"}`}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </div>
  );
}
