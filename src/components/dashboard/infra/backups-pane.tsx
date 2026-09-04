"use client";

import { useState } from "react";
import { ago } from "@/lib/connection-state";
import type { ModuleDensity } from "@/lib/layout/types";
import type { BackupStatus } from "@/types";
import { cutByDensity, foldLabel } from "./density";
import { DensityFold } from "./density-fold";
import { Pane, PaneEmpty, type PaneTone } from "./pane";
import { StatusRow, toneOf } from "./status-row";

const RANK: Record<PaneTone, number> = { bad: 0, warn: 1, idle: 2, ok: 3 };

function parsedMs(value: string | null): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The agent's status field was computed when the agent last ran. The interval
 * and the timestamp on the row are enough to check that verdict now, so a
 * target that has quietly gone past its window is not left reading "ok"
 * because nothing has re-evaluated it since.
 */
function toneFor(backup: BackupStatus): PaneTone {
  const reported = toneOf(backup.status);
  const last = parsedMs(backup.last_backup_at);
  if (last === null) return "bad";

  const hours = backup.expected_interval_hours;
  if (!hours || hours <= 0) return reported;

  const overdueBy = Date.now() - last - hours * 3_600_000;
  // The same grace the alert rules use: expected + 1h warns, + 2h is critical.
  const derived: PaneTone = overdueBy > 2 * 3_600_000 ? "bad" : overdueBy > 3_600_000 ? "warn" : "ok";
  return RANK[derived] < RANK[reported] ? derived : reported;
}

function intervalNote(backup: BackupStatus, density: ModuleDensity): string {
  const route = [backup.source, backup.target].filter(Boolean).join(" to ");
  const hours = backup.expected_interval_hours;
  const parts: string[] = [];
  if (route) parts.push(route);
  if (hours && hours > 0) parts.push(`expected every ${hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`}`);
  // Size is only interesting on the drill-down, so Full is the one that gets it.
  if (density === "full" && backup.size_mb) {
    parts.push(backup.size_mb >= 1024 ? `${(backup.size_mb / 1024).toFixed(1)} GB` : `${Math.round(backup.size_mb)} MB`);
  }
  return parts.length ? parts.join(" · ") : "route not reported";
}

export function BackupsPane({
  backups,
  density = "standard",
}: {
  backups: BackupStatus[] | undefined;
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (!backups || backups.length === 0) {
    return (
      <Pane title="Backups" readout="no targets">
        <PaneEmpty>No backup target has reported. Freshness is unknown, not good.</PaneEmpty>
      </Pane>
    );
  }

  const rows = backups
    .map((backup) => ({ backup, tone: toneFor(backup) }))
    .sort((a, b) => RANK[a.tone] - RANK[b.tone] || a.backup.backup_name.localeCompare(b.backup.backup_name));

  const stale = rows.filter((row) => row.tone !== "ok").length;
  const worst = rows[0]?.tone ?? "idle";
  const cut = cutByDensity(rows, density, (row) => row.tone === "ok", expanded);

  return (
    <Pane
      title="Backups"
      tone={stale > 0 ? worst : "ok"}
      readout={stale > 0 ? `${stale} of ${rows.length} stale` : `${rows.length} fresh`}
    >
      {cut.rows.length > 0 && (
        <ul className="status-list">
          {cut.rows.map(({ backup, tone }) => (
            <StatusRow
              key={backup.backup_name}
              tone={tone}
              name={backup.backup_name}
              note={intervalNote(backup, density)}
              right={ago(backup.last_backup_at) ?? "never run"}
              word={tone === "bad" ? "overdue" : tone === "warn" ? "late" : "fresh"}
            />
          ))}
        </ul>
      )}
      {cut.fold && (
        <DensityFold
          label={foldLabel(cut, "target", "fresh")}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </Pane>
  );
}
