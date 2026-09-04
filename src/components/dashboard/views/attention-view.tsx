"use client";

import { ShieldCheck } from "lucide-react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { useLayout, useResolvedView } from "@/lib/layout/client";
import { GRID_CLASS } from "@/lib/layout/grid";
import type { ResolvedView } from "@/lib/layout/types";
import { VIEW_BY_ID } from "@/lib/views";
import { useDesktop, ViewEditor } from "@/components/layout-editor";
import { ModuleFrame } from "./module-frame";
import { moduleNode } from "./module-renderers";
import { SourceFreshnessNotice, ViewError, ViewLede } from "./view-chrome";

/**
 * The actionable incident queue, and nothing else. The signal count, the
 * freshness notice and the all-clear note are system chrome: they are drawn
 * here, outside the placement grid, so no profile can touch them. The alert
 * detail is the one placement, required in the catalog so it cannot be
 * hidden; density is the only thing Bob chooses, and no density hides a
 * critical (see lib/alerts-density.ts).
 */
export function AttentionView() {
  const { data, error } = useDashboardData();
  const { editing, ready } = useLayout();
  const desktop = useDesktop();
  const health = getDashboardHealth(data);
  const resolved = useResolvedView("alerts");

  if (editing) {
    return (
      <div className="cockpit-view">
        <ViewEditor
          viewId="alerts"
          resolved={resolved}
          preview={desktop ? <AlertGrid resolved={resolved} data={data} editing /> : undefined}
        />
      </div>
    );
  }

  return (
    <div className="cockpit-view space-y-4">
      <ViewLede>{VIEW_BY_ID.alerts.description}</ViewLede>
      {error && <ViewError message={error} />}

      <div className="mb-1 flex items-center justify-between gap-4">
        <p className="eyebrow">Priority 00</p>
        <span className="rounded-full border border-line px-3 py-1 font-mono text-mini font-bold text-ink-quiet">
          {health.attentionCount} signal{health.attentionCount === 1 ? "" : "s"}
        </span>
      </div>

      <SourceFreshnessNotice agentStale={health.agentStale} uptimeStale={health.uptimeStale} />

      {ready && data && <AlertGrid resolved={resolved} data={data} />}

      {data && health.attentionCount === 0 && (
        <div className="view-note view-note--good">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <b>No active exceptions. The queue is clear.</b>
        </div>
      )}
    </div>
  );
}

function AlertGrid({
  resolved,
  data,
  editing = false,
}: {
  resolved: ResolvedView;
  data: ReturnType<typeof useDashboardData>["data"];
  editing?: boolean;
}) {
  const health = getDashboardHealth(data);
  if (!data) return null;
  return (
    <div className={GRID_CLASS}>
      {resolved.modules.map((entry) => {
        const node = moduleNode(entry.moduleId, {
          data,
          // Stale sources already own the screen through the notice above;
          // an "all operational" line under it would contradict it.
          agentStale: health.agentStale || health.uptimeStale,
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
