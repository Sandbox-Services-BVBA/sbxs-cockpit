"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

interface Domain {
  name: string;
  renewal_date: string;
  days_left: number;
  registrar?: string;
  status: string;
}

export function DomainsWidget({ domains }: { domains: Domain[] | null }) {
  if (!domains || domains.length === 0) {
    return (
      <WidgetTile title="Domain Renewals" size="sm">
        <p className="text-[11px] text-muted-foreground">No data</p>
      </WidgetTile>
    );
  }

  // Only show future renewals, sorted by soonest first
  const upcoming = domains.filter((d) => d.days_left > 0).slice(0, 8);
  const soonCount = upcoming.filter((d) => d.days_left <= 30).length;

  return (
    <WidgetTile
      title="Domain Renewals"
      size="sm"
      headerRight={
        <span className={cn("text-[9px] font-mono", soonCount > 0 ? "text-[#ccaa33]" : "text-muted-foreground")}>
          {domains.filter((d) => d.days_left > 0).length} upcoming
        </span>
      }
    >
      <div className="space-y-1">
        {upcoming.length > 0 ? upcoming.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className={cn(
              "h-1.5 w-1.5 shrink-0",
              d.days_left <= 7 ? "bg-[#ccaa33]" : "bg-muted-foreground"
            )} />
            <span className="text-[11px] truncate flex-1">{d.name}</span>
            {d.registrar && (
              <span className="text-[8px] font-mono text-muted-foreground border border-border px-1">
                {d.registrar}
              </span>
            )}
            <span className={cn(
              "text-[9px] font-mono whitespace-nowrap",
              d.days_left <= 7 ? "text-[#ccaa33]" : "text-muted-foreground"
            )}>
              {d.days_left}d
            </span>
          </div>
        )) : (
          <p className="text-[9px] text-[#33aa55] font-mono">NO UPCOMING RENEWALS</p>
        )}
      </div>
    </WidgetTile>
  );
}
