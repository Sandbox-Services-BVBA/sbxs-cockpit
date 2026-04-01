"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusDot, MetricValue } from "./status-indicator";
import { Server, HardDrive, Cpu, MemoryStick } from "lucide-react";
import type { ServerHealth as ServerHealthType } from "@/types";
import { cn } from "@/lib/utils";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function getProgressColor(percent: number): string {
  if (percent >= 90) return "[&>div]:bg-red-500";
  if (percent >= 80) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
}

function getDiskStatus(percent: number): "ok" | "warning" | "critical" {
  if (percent >= 90) return "critical";
  if (percent >= 80) return "warning";
  return "ok";
}

function ServerCard({ server }: { server: ServerHealthType }) {
  const diskStatus = getDiskStatus(server.disk_usage_percent);

  return (
    <Card className="bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{server.server_name}</CardTitle>
          </div>
          <StatusDot status={diskStatus} size="md" />
        </div>
        <p className="text-xs text-muted-foreground">
          Up {formatUptime(server.uptime_seconds)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              Disk
            </div>
            <span className={cn("font-medium", diskStatus === "critical" && "text-red-400", diskStatus === "warning" && "text-amber-400")}>
              {server.disk_used_gb.toFixed(1)} / {server.disk_total_gb.toFixed(0)} GB
            </span>
          </div>
          <Progress value={server.disk_usage_percent} className={cn("h-2", getProgressColor(server.disk_usage_percent))} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MemoryStick className="h-3 w-3" />
              RAM
            </div>
            <span className="font-medium">
              {(server.ram_used_mb / 1024).toFixed(1)} / {(server.ram_total_mb / 1024).toFixed(1)} GB
            </span>
          </div>
          <Progress value={server.ram_usage_percent} className={cn("h-2", getProgressColor(server.ram_usage_percent))} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Cpu className="h-3 w-3" />
              CPU
            </div>
            <span className="font-medium">{server.cpu_usage_percent.toFixed(0)}%</span>
          </div>
          <Progress value={server.cpu_usage_percent} className={cn("h-2", getProgressColor(server.cpu_usage_percent))} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ServerHealthSection({ servers }: { servers: ServerHealthType[] }) {
  if (servers.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Server className="h-5 w-5" /> Servers
        </h2>
        <Card className="bg-card/50">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No server data yet. Waiting for cockpit-agent...
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Server className="h-5 w-5" /> Servers
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {servers.map((s) => (
          <ServerCard key={s.server_name} server={s} />
        ))}
      </div>
    </section>
  );
}
