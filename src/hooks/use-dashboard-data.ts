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
  inboxes: { account: string; unread: number; threads: number }[] | null;
  domains: { name: string; renewal_date: string; days_left: number; status: string }[] | null;
  cityscreens: { player_id: string; name: string; location: string; mode: string; last_seen: string; active: boolean }[] | null;
  mailroom: { total: number; today: number; week: number; by_priority: Record<string, number>; recent_by_priority: Record<string, number> } | null;
  unbilled: { total_hours: number; total_amount: number; entry_count: number; by_client: Record<string, number> } | null;
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
