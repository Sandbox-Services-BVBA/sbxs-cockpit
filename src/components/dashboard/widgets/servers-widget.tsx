"use client";

import { WidgetTile } from "../widget-tile";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ServerHealth } from "@/types";

function MiniServer({ s }: { s: ServerHealth }) {
  const diskColor = s.disk_usage_percent >= 90 ? "text-red-400 [&>div]:bg-red-500" : s.disk_usage_percent >= 80 ? "text-amber-400 [&>div]:bg-amber-500" : "text-emerald-400 [&>div]:bg-emerald-500";
  const upDays = Math.floor(s.uptime_seconds / 86400);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium truncate">{s.server_name}</span>
        <span className="text-[10px] text-muted-foreground">{upDays}d up</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>Disk</span>
            <span className={cn(s.disk_usage_percent >= 80 && diskColor)}>{s.disk_usage_percent}%</span>
          </div>
          <Progress value={s.disk_usage_percent} className={cn("h-1", diskColor)} />
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>RAM</span>
            <span>{s.ram_usage_percent}%</span>
          </div>
          <Progress value={s.ram_usage_percent} className="h-1 [&>div]:bg-chart-2" />
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>CPU</span>
            <span>{s.cpu_usage_percent}%</span>
          </div>
          <Progress value={s.cpu_usage_percent} className="h-1 [&>div]:bg-chart-2" />
        </div>
      </div>
    </div>
  );
}

export function ServersWidget({ servers }: { servers: ServerHealth[] }) {
  if (servers.length === 0) {
    return (
      <WidgetTile title="Servers" size="lg">
        <p className="text-xs text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile title="Servers" size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {servers.map((s) => (
          <MiniServer key={s.server_name} s={s} />
        ))}
      </div>
    </WidgetTile>
  );
}
