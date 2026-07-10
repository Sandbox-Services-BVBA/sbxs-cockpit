"use client";

import { formatDistanceToNow } from "date-fns";
import type { Alert } from "@/types";

export function AlertsSummaryWidget({ alerts, suppressHealthy = false }: { alerts: Alert[]; suppressHealthy?: boolean }) {
  if (alerts.length === 0) {
    if (suppressHealthy) return null;
    return (
      <div className="col-span-full flex items-center gap-3 rounded-xl border border-emerald-600/25 bg-emerald-600/[0.07] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-emerald-600" />
        <span className="text-petite font-bold text-emerald-800 dark:text-emerald-200">All monitored systems are operational</span>
      </div>
    );
  }

  const criticals = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="col-span-full space-y-2">
      {criticals.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-red-600/35 bg-red-600/[0.08] px-4 py-3 text-red-900 dark:text-red-100">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-600 motion-safe:animate-pulse" />
          <span className="min-w-0 flex-1 truncate text-petite font-bold">
            {a.source}: {a.message}
          </span>
          <span className="shrink-0 font-mono text-mini text-red-800/60 dark:text-red-200/60">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
        </div>
      ))}
      {warnings.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-600/30 bg-amber-500/[0.08] px-4 py-3 text-amber-900 dark:text-amber-100">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-600" />
          <span className="min-w-0 flex-1 truncate text-petite">
            <b>{warnings.length}</b> warning{warnings.length > 1 ? "s" : ""}: {warnings.map((w) => w.source).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
