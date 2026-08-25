"use client";

import { ago } from "@/lib/connection-state";
import type { CronJob } from "@/types";
import { Pane, PaneEmpty } from "./pane";
import { StatusRow, toneOf } from "./status-row";

const ORDER = { critical: 0, warning: 1, unknown: 2, ok: 3 } as const;

function note(cron: CronJob): string {
  const where = cron.server_name ? `${cron.server_name} · ` : "";
  const when = cron.schedule_human || cron.schedule || "schedule not reported";
  // A non-zero exit is the whole reason the row is here, so it leads.
  if (cron.status !== "ok" && cron.exit_code !== null && cron.exit_code !== 0) {
    return `exit ${cron.exit_code} · ${where}${when}`;
  }
  return `${where}${when}`;
}

export function CronsPane({ crons }: { crons: CronJob[] | undefined }) {
  if (!crons || crons.length === 0) {
    return (
      <Pane title="Scheduled jobs" readout="no jobs">
        <PaneEmpty>No cron has reported a run. Nothing here is being watched.</PaneEmpty>
      </Pane>
    );
  }

  const sorted = [...crons].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || a.cron_name.localeCompare(b.cron_name)
  );
  const failing = crons.filter((cron) => cron.status !== "ok").length;
  // The pane's headline follows its worst row rather than flattening a failed
  // job into a generic warning.
  const worst = toneOf(sorted[0]?.status ?? "unknown");

  return (
    <Pane
      title="Scheduled jobs"
      tone={failing > 0 ? worst : "ok"}
      readout={failing > 0 ? `${failing} of ${crons.length} off schedule` : `${crons.length} on schedule`}
    >
      <ul className="status-list">
        {sorted.map((cron) => (
          <StatusRow
            key={`${cron.server_name}-${cron.cron_name}`}
            tone={toneOf(cron.status)}
            name={cron.cron_name}
            note={note(cron)}
            right={ago(cron.last_run_at) ?? "never run"}
          />
        ))}
      </ul>
    </Pane>
  );
}
