"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

interface Domain {
  name: string;
  renewal_date: string;
  days_left: number;
  status: string;
}

export function DomainsWidget({ domains }: { domains: Domain[] | null }) {
  if (!domains || domains.length === 0) {
    return (
      <WidgetTile title="Domain Expiry" size="sm">
        <p className="text-[11px] text-muted-foreground">No data</p>
      </WidgetTile>
    );
  }

  // Show domains expiring in next 60 days, or top 8
  const upcoming = domains.filter((d) => d.days_left <= 60 && d.days_left >= 0).slice(0, 8);
  const expired = domains.filter((d) => d.days_left < 0);
  const warningCount = domains.filter((d) => d.days_left <= 30 && d.days_left >= 0).length;

  return (
    <WidgetTile
      title="Domain Expiry"
      size="sm"
      headerRight={
        <span className={cn("text-[9px] font-mono", warningCount > 0 ? "text-[#ccaa33]" : "text-muted-foreground")}>
          {warningCount > 0 ? `${warningCount} soon` : `${domains.length} total`}
        </span>
      }
    >
      <div className="space-y-1">
        {expired.length > 0 && (
          <div className="border border-[#ff4444] bg-[#ff4444]/10 px-1.5 py-0.5 text-[9px] font-mono text-[#ff4444]">
            {expired.length} EXPIRED
          </div>
        )}
        {upcoming.length > 0 ? upcoming.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className={cn(
              "h-1.5 w-1.5 shrink-0",
              d.days_left <= 7 ? "bg-[#ff4444]" : d.days_left <= 30 ? "bg-[#ccaa33]" : "bg-[#33aa55]"
            )} />
            <span className="text-[11px] truncate flex-1">{d.name}</span>
            <span className={cn(
              "text-[9px] font-mono whitespace-nowrap",
              d.days_left <= 7 ? "text-[#ff4444]" : d.days_left <= 30 ? "text-[#ccaa33]" : "text-muted-foreground"
            )}>
              {d.days_left}d
            </span>
          </div>
        )) : (
          <p className="text-[9px] text-[#33aa55] font-mono">ALL CLEAR 60+ DAYS</p>
        )}
      </div>
    </WidgetTile>
  );
}
