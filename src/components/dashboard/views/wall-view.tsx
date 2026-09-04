"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { useLayout, useResolvedView } from "@/lib/layout/client";
import type { ResolvedView } from "@/lib/layout/types";
import { VIEW_BY_ID } from "@/lib/views";
import { ViewEditor } from "@/components/layout-editor";
import { CockpitSummary } from "../cockpit-summary";
import { AlertsSummaryWidget } from "../widgets/alerts-summary-widget";
import { ModuleErrorBoundary } from "./module-frame";
import { moduleNode } from "./module-renderers";
import { SourceFreshnessNotice, ViewError, ViewLede } from "./view-chrome";

/**
 * The shared display, rendered through the placement engine. Which modules
 * show and in what order comes from the resolved "wall" view; what may show
 * at all does not: the resolver drops every private and control module from
 * the wall whatever the profile says, and the write endpoint refuses to save
 * one there. The summary strip and the attention queue above the matrix are
 * chrome, not placements.
 *
 * There is no Customize button on this route because the wall runs
 * unattended. Open Customize on any domain and navigate here to edit it; the
 * profile is server-synced, so the display picks the change up on its own.
 */
export function WallView() {
  const { data, error } = useDashboardData();
  const { editing, ready } = useLayout();
  const health = getDashboardHealth(data);
  const resolved = useResolvedView("wall");

  if (editing) {
    return (
      <div className="cockpit-view">
        <ViewEditor viewId="wall" resolved={resolved} />
      </div>
    );
  }

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
        {ready && <WallMatrix resolved={resolved} data={data} agentStale={health.agentStale} />}
      </section>
    </div>
  );
}

/**
 * The wall keeps its masonry columns rather than the semantic grid: a TV
 * across the room reads equal-width cards packed tight better than a row
 * grid with gaps. Width is therefore not a wall setting; order and visibility
 * are, and density reaches the list widgets like anywhere else.
 */
function WallMatrix({
  resolved,
  data,
  agentStale,
}: {
  resolved: ResolvedView;
  data: ReturnType<typeof useDashboardData>["data"];
  agentStale: boolean;
}) {
  // Hidden modules are absent from `resolved.modules`, so they never mount.
  // Shared-data modules wait for the payload; self-fetching ones render now.
  const modules = resolved.modules.filter(
    (entry) => entry.definition.dataMode === "self-fetch" || data
  );

  return (
    <div className="[column-gap:0.75rem] [column-width:340px]">
      {modules.map((entry) => {
        const node = moduleNode(entry.moduleId, { data, agentStale, density: entry.density, layout: "wall" });
        if (node === null) return null;
        return (
          <div key={entry.moduleId} data-module-id={entry.moduleId} className="mb-3 break-inside-avoid">
            <ModuleErrorBoundary title={entry.definition.title}>{node}</ModuleErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
