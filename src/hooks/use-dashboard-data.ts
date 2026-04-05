"use client";

import useSWR from "swr";
import type { ServerHealth, BackupStatus, UptimeCheck, CronJob, Project, IntegrationHealth, Alert } from "@/types";

interface DashboardData {
  servers: ServerHealth[];
  backups: BackupStatus[];
  uptime: UptimeCheck[];
  uptimeHistory: UptimeCheck[];
  crons: CronJob[];
  projects: Project[];
  integrations: IntegrationHealth[];
  alerts: Alert[];
  serverHistory: ServerHealth[];
  lastUpdated: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useDashboardData() {
  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    "/api/dashboard",
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      dedupingInterval: 10000,
    }
  );

  return { data: data ?? null, loading: isLoading, error: error?.message ?? null, refresh: mutate };
}
