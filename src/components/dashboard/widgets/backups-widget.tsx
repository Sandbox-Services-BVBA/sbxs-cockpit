"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { BackupStatus } from "@/types";

const statusDot: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  unknown: "bg-zinc-500",
};

export function BackupsWidget({ backups }: { backups: BackupStatus[] }) {
  if (backups.length === 0) {
    return (
      <WidgetTile title="Backups" size="md">
        <p className="text-xs text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  const okCount = backups.filter((b) => b.status === "ok").length;

  return (
    <WidgetTile
      title="Backups"
      size="md"
      headerRight={<span className="text-[10px] text-muted-foreground">{okCount}/{backups.length}</span>}
    >
      <div className="space-y-2">
        {backups.map((b) => (
          <div key={b.backup_name} className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot[b.status])} />
            <span className="text-xs truncate flex-1">{b.backup_name}</span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {b.last_backup_at ? formatDistanceToNow(new Date(b.last_backup_at), { addSuffix: true }) : "never"}
            </span>
          </div>
        ))}
      </div>
    </WidgetTile>
  );
}
