"use client";

import { useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { ModuleDensity } from "@/lib/layout/types";
import type { BackupStatus } from "@/types";
import { cutByDensity, foldLabel } from "../infra/density";
import { DensityFold } from "../infra/density-fold";

const statusDot: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  unknown: "bg-zinc-500",
};

export function BackupsWidget({
  backups,
  density = "standard",
}: {
  backups: BackupStatus[];
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (backups.length === 0) {
    return (
      <WidgetTile title="Backups" size="md">
        <p className="text-xs text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  const okCount = backups.filter((b) => b.status === "ok").length;
  const cut = cutByDensity(backups, density, (b) => b.status === "ok", expanded);

  return (
    <WidgetTile
      title="Backups"
      size="md"
      headerRight={<span className="text-tiny text-muted-foreground">{okCount}/{backups.length}</span>}
    >
      {cut.rows.length > 0 && (
        <div className="space-y-2">
          {cut.rows.map((b) => (
            <div key={b.backup_name} className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5  shrink-0", statusDot[b.status])} />
              <span className="text-xs truncate flex-1">{b.backup_name}</span>
              <span className="text-tiny text-muted-foreground whitespace-nowrap">
                {b.last_backup_at ? formatDistanceToNow(new Date(b.last_backup_at), { addSuffix: true }) : "never"}
              </span>
            </div>
          ))}
        </div>
      )}
      {cut.fold && (
        <DensityFold
          label={foldLabel(cut, "target", "fresh")}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </WidgetTile>
  );
}
