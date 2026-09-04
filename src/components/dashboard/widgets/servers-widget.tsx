"use client";

import { useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { ModuleDensity } from "@/lib/layout/types";
import type { ServerHealth } from "@/types";
import { cutByDensity, foldLabel } from "../infra/density";
import { DensityFold } from "../infra/density-fold";

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
        <span className="text-petite font-bold truncate">{s.server_name}</span>
        <span className="text-mini text-muted-foreground font-mono">{upDays}d</span>
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-mini text-muted-foreground w-6 font-mono">DSK</span>
          <Bar value={s.disk_usage_percent} color={diskColor} />
          <span className="text-mini font-mono w-7 text-right">{s.disk_usage_percent}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-mini text-muted-foreground w-6 font-mono">RAM</span>
          <Bar value={s.ram_usage_percent} color={ramColor} />
          <span className="text-mini font-mono w-7 text-right">{s.ram_usage_percent}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-mini text-muted-foreground w-6 font-mono">CPU</span>
          <Bar value={s.cpu_usage_percent} color="bg-chart-2" />
          <span className="text-mini font-mono w-7 text-right">{s.cpu_usage_percent}%</span>
        </div>
      </div>
    </div>
  );
}

// The same 80% line the amber bars use, so a node folded away at summary is
// one that would have drawn every bar green.
function headroom(s: ServerHealth): boolean {
  return s.disk_usage_percent < 80 && s.ram_usage_percent < 80 && s.cpu_usage_percent < 80;
}

export function ServersWidget({
  servers,
  density = "standard",
}: {
  servers: ServerHealth[];
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (servers.length === 0) {
    return (
      <WidgetTile title="Servers" size="lg">
        <p className="text-petite text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  const cut = cutByDensity(servers, density, headroom, expanded);

  return (
    <WidgetTile title="Servers" size="lg" headerRight={<span className="text-mini text-muted-foreground font-mono">{servers.length} nodes</span>}>
      {cut.rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
          {cut.rows.map((s) => (
            <MiniServer key={s.server_name} s={s} />
          ))}
        </div>
      )}
      {cut.fold && (
        <DensityFold
          label={foldLabel(cut, "node", "with headroom")}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </WidgetTile>
  );
}
