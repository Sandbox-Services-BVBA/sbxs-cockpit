"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { useLayout, useResolvedView } from "@/lib/layout/client";
import { GRID_CLASS } from "@/lib/layout/grid";
import type { ResolvedView } from "@/lib/layout/types";
import { VIEW_BY_ID } from "@/lib/views";
import { useDesktop, ViewEditor } from "@/components/layout-editor";
import { ModuleFrame } from "./module-frame";
import { moduleNode } from "./module-renderers";
import { SourceFreshnessNotice, ViewError, ViewLede, ViewSkeleton } from "./view-chrome";

/**
 * Infrastructure rendered through the placement engine, the same way the
 * standard domains are: the resolver decides which modules show, in what
 * order, at what width and density; the frame owns the span; each pane owns
 * its content and nothing else. The freshness notice stays as chrome above
 * the grid because a stale agent is a fact about every pane at once.
 */
export function InfraView() {
  const { data, loading, error } = useDashboardData();
  const { editing, ready } = useLayout();
  const desktop = useDesktop();
  const health = getDashboardHealth(data);
  const resolved = useResolvedView("infra");

  if (editing) {
    return (
      <div className="cockpit-view">
        <ViewEditor
          viewId="infra"
          resolved={resolved}
          preview={desktop ? <InfraGrid resolved={resolved} data={data} editing /> : undefined}
        />
      </div>
    );
  }

  // Until the profile is known a hidden module could mount on the defaults;
  // the skeleton covers that wait as well as the first dashboard fetch.
  if (!ready || (loading && !data)) {
    return (
      <div className="cockpit-view space-y-4">
        <ViewLede>{VIEW_BY_ID.infra.description}</ViewLede>
        <ViewSkeleton />
      </div>
    );
  }

  return (
    <div className="cockpit-view space-y-4">
      <ViewLede>{VIEW_BY_ID.infra.description}</ViewLede>
      {error && <ViewError message={error} />}
      <SourceFreshnessNotice agentStale={health.agentStale} uptimeStale={false} />
      <InfraGrid resolved={resolved} data={data} />
    </div>
  );
}

function InfraGrid({
  resolved,
  data,
  editing = false,
}: {
  resolved: ResolvedView;
  data: ReturnType<typeof useDashboardData>["data"];
  editing?: boolean;
}) {
  const health = getDashboardHealth(data);

  // Hidden modules are absent from `resolved.modules`, so they never mount.
  // Shared-data modules wait for the payload; self-fetching ones render now.
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
