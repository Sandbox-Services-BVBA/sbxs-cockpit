"use client";

import { Fragment } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { DEFAULT_WIDGETS, type WidgetCategory } from "@/lib/widget-registry";
import { VIEW_BY_ID, type ViewId } from "@/lib/views";
import { widgetNode } from "./widget-nodes";
import { ViewError, ViewLede, ViewSkeleton } from "./view-chrome";

const SECTION_GRID = "grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-6";

/**
 * The pre-migration view: a domain's registered widgets in the shared grid.
 * Infrastructure has its own converted view; everything else still renders
 * this way until phase 2 reaches it.
 */
export function DomainView({ category }: { category: WidgetCategory }) {
  const { data, loading, error } = useDashboardData();
  const health = getDashboardHealth(data);
  const meta = VIEW_BY_ID[category as ViewId];

  const widgets = DEFAULT_WIDGETS
    .filter((widget) => widget.category === category && (widget.selfFetch || data))
    .sort((a, b) => a.order - b.order);

  return (
    <div className="cockpit-view space-y-4">
      <ViewLede>{meta.description}</ViewLede>
      {error && <ViewError message={error} />}
      {loading && !data ? (
        <ViewSkeleton />
      ) : (
        <div className={SECTION_GRID}>
          {widgets.map((widget) => (
            <Fragment key={widget.id}>
              {widgetNode(widget.id, { data, layout: "grid", agentStale: health.agentStale })}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
