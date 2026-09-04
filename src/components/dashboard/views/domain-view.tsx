"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { GRID_CLASS } from "@/lib/layout/grid";
import { resolveView } from "@/lib/layout/resolver";
import type { ViewId } from "@/lib/layout/types";
import type { WidgetCategory } from "@/lib/widget-registry";
import { VIEW_BY_ID } from "@/lib/views";
import { ModuleFrame } from "./module-frame";
import { moduleNode } from "./module-renderers";
import { ViewError, ViewLede, ViewSkeleton } from "./view-chrome";

/**
 * A standard domain rendered through the placement engine: the resolver
 * decides which modules show, in what order and at what width; the frame
 * owns the span; the renderer map owns the content.
 *
 * The profile is always null for now. Persistence lands separately and will
 * hand a saved profile in here; the seam exists so nothing else has to move.
 */
export function DomainView({ category }: { category: WidgetCategory }) {
  const { data, loading, error } = useDashboardData();
  const health = getDashboardHealth(data);
  const viewId = category as ViewId;
  const meta = VIEW_BY_ID[viewId];
  const resolved = resolveView(viewId, null);

  // Hidden modules are absent from `resolved.modules`, so they never mount
  // and a self-fetching one stops polling. Shared-data modules wait for the
  // payload; self-fetching ones render straight away.
  const modules = resolved.modules.filter(
    (entry) => entry.definition.dataMode === "self-fetch" || data
  );

  return (
    <div className="cockpit-view space-y-4">
      <ViewLede>{meta.description}</ViewLede>
      {error && <ViewError message={error} />}
      {loading && !data ? (
        <ViewSkeleton />
      ) : (
        <div className={GRID_CLASS}>
          {modules.map((entry) => {
            const node = moduleNode(entry.moduleId, {
              data,
              agentStale: health.agentStale,
              density: entry.density,
              layout: "grid",
            });
            if (node === null) return null;
            return (
              <ModuleFrame key={entry.moduleId} resolved={entry}>
                {node}
              </ModuleFrame>
            );
          })}
        </div>
      )}
    </div>
  );
}
