"use client";

import { formatDistanceToNow } from "date-fns";
import type { Alert } from "@/types";

export function AlertsSummaryWidget({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="col-span-full border-2 border-[#33aa55] bg-[#33aa55]/10 px-2 py-1.5 flex items-center gap-2">
        <span className="h-2 w-2 bg-[#33aa55]" />
        <span className="text-[11px] font-bold text-[#33aa55] uppercase tracking-wide">All systems operational</span>
      </div>
    );
  }

  const criticals = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="col-span-full space-y-1">
      {criticals.map((a) => (
        <div key={a.id} className="border-2 border-[#ff4444] bg-[#ff4444]/10 px-2 py-1.5 flex items-center gap-2">
          <span className="h-2 w-2 bg-[#ff4444] animate-pulse" />
          <span className="text-[11px] font-bold flex-1 truncate">
            {a.source}: {a.message}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
        </div>
      ))}
      {warnings.length > 0 && (
        <div className="border-2 border-[#ccaa33] bg-[#ccaa33]/10 px-2 py-1.5 flex items-center gap-2">
          <span className="h-2 w-2 bg-[#ccaa33]" />
          <span className="text-[11px] flex-1 truncate">
            <b>{warnings.length}</b> warning{warnings.length > 1 ? "s" : ""}: {warnings.map((w) => w.source).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
