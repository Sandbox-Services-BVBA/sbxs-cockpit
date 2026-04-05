"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { IntegrationHealth } from "@/types";

const statusDot: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

export function IntegrationsWidget({ integrations }: { integrations: IntegrationHealth[] }) {
  if (integrations.length === 0) {
    return (
      <WidgetTile title="Integrations" size="md">
        <p className="text-xs text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  const healthyCount = integrations.filter((i) => i.status === "ok").length;

  return (
    <WidgetTile
      title="Integrations"
      size="md"
      headerRight={<span className="text-[10px] text-muted-foreground">{healthyCount}/{integrations.length}</span>}
    >
      <div className="grid grid-cols-2 gap-2">
        {integrations.map((i) => (
          <div key={i.integration_name} className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot[i.status])} />
            <span className="text-xs truncate">{i.integration_name}</span>
          </div>
        ))}
      </div>
    </WidgetTile>
  );
}
