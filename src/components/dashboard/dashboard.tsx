"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { DashboardHeader } from "./header";
import { AlertsBar } from "./alerts-bar";
import { ServerHealthSection } from "./server-health";
import { BackupStatusSection } from "./backup-status";
import { UptimeSection } from "./uptime-monitor";
import { CronStatusSection } from "./cron-status";
import { ProjectsOverviewSection } from "./projects-overview";
import { IntegrationHealthSection } from "./integration-health";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardSkeleton() {
  return (
    <div className="space-y-8 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data, loading, error, refresh } = useDashboardData();

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        lastUpdated={data?.lastUpdated || null}
        onRefresh={refresh}
        loading={loading}
      />

      {error && (
        <div className="mx-6 mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          Failed to load dashboard data: {error}
        </div>
      )}

      {loading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <main className="p-6 space-y-8 max-w-[1800px] mx-auto">
          {/* Active alerts at the top */}
          <AlertsBar alerts={data.alerts} />

          {/* Server health */}
          <ServerHealthSection servers={data.servers} />

          {/* Two-column layout for backups and uptime */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <BackupStatusSection backups={data.backups} />
            <CronStatusSection crons={data.crons} />
          </div>

          {/* Uptime monitoring */}
          <UptimeSection uptime={data.uptime} uptimeHistory={data.uptimeHistory} />

          {/* Projects */}
          <ProjectsOverviewSection projects={data.projects} />

          {/* Integrations */}
          <IntegrationHealthSection integrations={data.integrations} />
        </main>
      ) : null}
    </div>
  );
}
