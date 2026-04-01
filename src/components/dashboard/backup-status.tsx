"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-indicator";
import { Archive } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { BackupStatus as BackupStatusType } from "@/types";

function BackupRow({ backup }: { backup: BackupStatusType }) {
  const lastBackup = backup.last_backup_at
    ? formatDistanceToNow(new Date(backup.last_backup_at), { addSuffix: true })
    : "Never";

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{backup.backup_name}</p>
        <p className="text-xs text-muted-foreground">
          {backup.source} &rarr; {backup.target}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{lastBackup}</p>
          {backup.size_mb && (
            <p className="text-xs text-muted-foreground">{backup.size_mb.toFixed(0)} MB</p>
          )}
        </div>
        <StatusBadge status={backup.status} />
      </div>
    </div>
  );
}

export function BackupStatusSection({ backups }: { backups: BackupStatusType[] }) {
  if (backups.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Archive className="h-5 w-5" /> Backups
        </h2>
        <Card className="bg-card/50">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No backup data yet. Waiting for cockpit-agent...
          </CardContent>
        </Card>
      </section>
    );
  }

  const okCount = backups.filter((b) => b.status === "ok").length;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Archive className="h-5 w-5" /> Backups
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {okCount}/{backups.length} healthy
        </span>
      </h2>
      <Card className="bg-card/50 backdrop-blur">
        <CardContent className="pt-4">
          {backups.map((b) => (
            <BackupRow key={b.backup_name} backup={b} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
