"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Alert } from "@/types";

export function AlertsSummaryWidget({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="col-span-full flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs text-emerald-400 font-medium">All systems operational</span>
      </div>
    );
  }

  const criticals = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="col-span-full space-y-1.5">
      {criticals.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <span className="text-xs text-red-400 flex-1 truncate">
            <b>{a.source}</b>: {a.message}
          </span>
          <span className="text-[10px] text-red-400/60">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
        </div>
      ))}
      {warnings.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400 flex-1">
            {warnings.length} warning{warnings.length > 1 ? "s" : ""}: {warnings.map((w) => w.source).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
