"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { DEFAULT_WIDGETS } from "@/lib/widget-registry";
import { VIEW_BY_ID } from "@/lib/views";
import { CockpitSummary } from "../cockpit-summary";
import { AlertsSummaryWidget } from "../widgets/alerts-summary-widget";
import { widgetNode } from "./widget-nodes";
import { SourceFreshnessNotice, ViewError, ViewLede } from "./view-chrome";

// The wall omits private health, bank balances, files, and every write
// control: it is a shared display, not Bob's screen.
const WALLBOARD_IDS = new Set([
  "uptime-grid",
  "cityscreens",
  "domains",
  "servers",
  "backups",
  "connections",
  "crons",
  "services",
  "inbox",
  "mailroom",
]);

export function WallView() {
  const { data, error } = useDashboardData();
  const health = getDashboardHealth(data);

  const widgets = DEFAULT_WIDGETS
    .filter((widget) => WALLBOARD_IDS.has(widget.id) && (widget.selfFetch || data))
    .sort((a, b) => a.order - b.order);

  return (
    <div className="cockpit-view space-y-5">
      <ViewLede>{VIEW_BY_ID.wall.description}</ViewLede>
      {error && <ViewError message={error} />}

      <CockpitSummary data={data} />

      <section aria-labelledby="wall-attention" className="space-y-3">
        <p className="eyebrow" id="wall-attention">Priority 00 · attention queue</p>
        <SourceFreshnessNotice agentStale={health.agentStale} uptimeStale={health.uptimeStale} />
        {data && (
          <AlertsSummaryWidget
            alerts={data.alerts}
            suppressHealthy={health.agentStale || health.uptimeStale}
          />
        )}
      </section>

      <section aria-labelledby="wall-matrix" className="space-y-3">
        <p className="eyebrow" id="wall-matrix">Shared display · operational matrix</p>
        <div className="[column-gap:0.75rem] [column-width:340px]">
          {widgets.map((widget) => (
            <div key={widget.id} className="mb-3 break-inside-avoid">
              {widgetNode(widget.id, { data, layout: "wall", agentStale: health.agentStale })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
