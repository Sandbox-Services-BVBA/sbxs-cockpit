"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { useLayout, useResolvedView } from "@/lib/layout/client";
import { GRID_CLASS } from "@/lib/layout/grid";
import type { ResolvedView, ViewId } from "@/lib/layout/types";
import type { WidgetCategory } from "@/lib/widget-registry";
import { VIEW_BY_ID } from "@/lib/views";
import { useDesktop, ViewEditor } from "@/components/layout-editor";
import { ModuleFrame } from "./module-frame";
import { moduleNode } from "./module-renderers";
import { ViewError, ViewLede, ViewSkeleton } from "./view-chrome";

/**
 * A standard domain rendered through the placement engine: the resolver
 * decides which modules show, in what order and at what width; the frame
 * owns the span; the renderer map owns the content.
 *
 * The resolved view comes from the layout provider, so it is the saved
 * profile in normal use and the edit draft while Customize is active. In
 * edit mode the modules give way to the compact editor list; on desktop
 * the same grid comes back beside it as a live preview.
 */
export function DomainView({ category }: { category: WidgetCategory }) {
  const { data, loading, error } = useDashboardData();
  const { editing } = useLayout();
  const desktop = useDesktop();
  const viewId = category as ViewId;
  const meta = VIEW_BY_ID[viewId];
  const resolved = useResolvedView(viewId);

  if (editing) {
    return (
      <div className="cockpit-view">
        <ViewEditor
          viewId={viewId}
          resolved={resolved}
          preview={desktop ? <ModuleGrid resolved={resolved} data={data} editing /> : undefined}
        />
      </div>
    );
  }

  return (
    <div className="cockpit-view space-y-4">
      <ViewLede>{meta.description}</ViewLede>
      {error && <ViewError message={error} />}
      {loading && !data ? <ViewSkeleton /> : <ModuleGrid resolved={resolved} data={data} />}
    </div>
  );
}

function ModuleGrid({
  resolved,
  data,
  editing = false,
}: {
  resolved: ResolvedView;
  data: ReturnType<typeof useDashboardData>["data"];
  editing?: boolean;
}) {
  const health = getDashboardHealth(data);

  // Hidden modules are absent from `resolved.modules`, so they never mount
  // and a self-fetching one stops polling. Shared-data modules wait for the
  // payload; self-fetching ones render straight away.
  const modules = resolved.modules.filter(
    (entry) => entry.definition.dataMode === "self-fetch" || data
  );

  return (
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
          <ModuleFrame key={entry.moduleId} resolved={entry} editing={editing}>
            {node}
          </ModuleFrame>
        );
      })}
    </div>
  );
}
