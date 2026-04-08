"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { ServerHealth } from "@/types";

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 bg-muted border border-border flex-1">
      <div className={cn("h-full", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function MiniServer({ s }: { s: ServerHealth }) {
  const diskColor = s.disk_usage_percent >= 90 ? "bg-[#ff4444]" : s.disk_usage_percent >= 80 ? "bg-[#ccaa33]" : "bg-[#33aa55]";
  const ramColor = s.ram_usage_percent >= 90 ? "bg-[#ff4444]" : s.ram_usage_percent >= 80 ? "bg-[#ccaa33]" : "bg-chart-2";
  const upDays = Math.floor(s.uptime_seconds / 86400);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold truncate">{s.server_name}</span>
        <span className="text-[9px] text-muted-foreground font-mono">{upDays}d</span>
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground w-6 font-mono">DSK</span>
          <Bar value={s.disk_usage_percent} color={diskColor} />
          <span className="text-[9px] font-mono w-7 text-right">{s.disk_usage_percent}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground w-6 font-mono">RAM</span>
          <Bar value={s.ram_usage_percent} color={ramColor} />
          <span className="text-[9px] font-mono w-7 text-right">{s.ram_usage_percent}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground w-6 font-mono">CPU</span>
          <Bar value={s.cpu_usage_percent} color="bg-chart-2" />
          <span className="text-[9px] font-mono w-7 text-right">{s.cpu_usage_percent}%</span>
        </div>
      </div>
    </div>
  );
}

export function ServersWidget({ servers }: { servers: ServerHealth[] }) {
  if (servers.length === 0) {
    return (
      <WidgetTile title="Servers" size="lg">
        <p className="text-[11px] text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile title="Servers" size="lg" headerRight={<span className="text-[9px] text-muted-foreground font-mono">{servers.length} nodes</span>}>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
        {servers.map((s) => (
          <MiniServer key={s.server_name} s={s} />
        ))}
      </div>
    </WidgetTile>
  );
}
