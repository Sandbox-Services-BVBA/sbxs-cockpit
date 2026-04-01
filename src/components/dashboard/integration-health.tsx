"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StatusDot, StatusBadge } from "./status-indicator";
import { Plug } from "lucide-react";
import type { IntegrationHealth as IntegrationHealthType } from "@/types";

function IntegrationCard({ integration }: { integration: IntegrationHealthType }) {
  return (
    <Card className="bg-card/50 backdrop-blur">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{integration.integration_name}</p>
            <p className="text-xs text-muted-foreground">{integration.category}</p>
          </div>
          <StatusBadge status={integration.status} />
        </div>
        {integration.details && (
          <p className="text-xs text-muted-foreground mt-2 truncate">{integration.details}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function IntegrationHealthSection({ integrations }: { integrations: IntegrationHealthType[] }) {
  if (integrations.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plug className="h-5 w-5" /> Integrations
        </h2>
        <Card className="bg-card/50">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No integration data yet. Waiting for cockpit-agent...
          </CardContent>
        </Card>
      </section>
    );
  }

  const healthyCount = integrations.filter((i) => i.status === "ok").length;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Plug className="h-5 w-5" /> Integrations
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {healthyCount}/{integrations.length} healthy
        </span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {integrations.map((i) => (
          <IntegrationCard key={i.integration_name} integration={i} />
        ))}
      </div>
    </section>
  );
}
