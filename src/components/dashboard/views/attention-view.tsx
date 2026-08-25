"use client";

import { ShieldCheck } from "lucide-react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { VIEW_BY_ID } from "@/lib/views";
import { AlertsSummaryWidget } from "../widgets/alerts-summary-widget";
import { SourceFreshnessNotice, ViewError, ViewLede } from "./view-chrome";

/** The actionable incident queue, and nothing else. */
export function AttentionView() {
  const { data, error } = useDashboardData();
  const health = getDashboardHealth(data);

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

      {data && (
        <AlertsSummaryWidget
          alerts={data.alerts}
          suppressHealthy={health.agentStale || health.uptimeStale}
        />
      )}

      {data && health.attentionCount === 0 && (
        <div className="view-note view-note--good">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <b>No active exceptions. The queue is clear.</b>
        </div>
      )}
    </div>
  );
}
