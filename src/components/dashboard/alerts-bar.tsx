"use client";

import { AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types";
import { formatDistanceToNow } from "date-fns";

export function AlertsBar({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;

  const criticals = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="space-y-2">
      {criticals.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3"
        >
          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-400">{a.source}</p>
            <p className="text-xs text-red-400/80">{a.message}</p>
          </div>
          <span className="text-xs text-red-400/60 whitespace-nowrap">
            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
          </span>
        </div>
      ))}
      {warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1">
            {warnings.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <p className="text-xs text-amber-400/80 truncate">
                  <span className="font-medium text-amber-400">{a.source}</span>: {a.message}
                </p>
                <span className="text-xs text-amber-400/50 whitespace-nowrap">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
