"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

interface UnbilledData {
  total_hours: number;
  total_amount: number;
  entry_count: number;
  by_client: Record<string, number>;
}

export function UnbilledWidget({ unbilled }: { unbilled: UnbilledData | null }) {
  if (!unbilled) {
    return (
      <WidgetTile title="Unbilled" size="sm">
        <p className="text-[11px] text-muted-foreground">No data</p>
      </WidgetTile>
    );
  }

  const clients = Object.entries(unbilled.by_client)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <WidgetTile
      title="Unbilled"
      size="sm"
      headerRight={<span className="text-[9px] font-mono text-muted-foreground">{unbilled.total_hours.toFixed(1)}h</span>}
    >
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] text-muted-foreground font-mono">EUR</span>
          <span className={cn(
            "text-2xl font-black tabular-nums",
            unbilled.total_amount > 500 ? "text-[#ccaa33]" : ""
          )}>
            {Math.round(unbilled.total_amount).toLocaleString()}
          </span>
        </div>
        {clients.length > 0 && (
          <div className="space-y-0.5">
            {clients.slice(0, 5).map(([name, amount]) => (
              <div key={name} className="flex justify-between text-[9px] font-mono">
                <span className="text-muted-foreground truncate mr-2">{name}</span>
                <span>{Math.round(amount)}</span>
              </div>
            ))}
          </div>
        )}
        {unbilled.entry_count > 0 && (
          <p className="text-[9px] text-muted-foreground font-mono">{unbilled.entry_count} entries</p>
        )}
      </div>
    </WidgetTile>
  );
}
