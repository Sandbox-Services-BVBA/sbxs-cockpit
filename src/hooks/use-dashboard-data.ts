"use client";

import useSWR from "swr";
import type {
  AiUsage,
  Alert,
  BackupStatus,
  CronJob,
  GpuMetricHistory,
  GpuStatus,
  IntegrationHealth,
  Project,
  ServerHealth,
  Service,
  ThermalHistory,
  ThermalStatus,
  UptimeCheck,
} from "@/types";

export interface DashboardFreshness {
  agent: string | null;
  uptime: string | null;
  business: string | null;
}

export interface DashboardData {
  servers: ServerHealth[];
  gpu: GpuStatus | null;
  gpuHistory: GpuMetricHistory[];
  thermals: ThermalStatus | null;
  thermalHistory: ThermalHistory[];
  services: Service[] | null;
  backups: BackupStatus[];
  uptime: UptimeCheck[];
  uptimeHistory: UptimeCheck[];
  crons: CronJob[];
  projects: Project[];
  integrations: IntegrationHealth[];
  alerts: Alert[];
  inboxes: { account: string; unread: number; threads: number }[] | null;
  domains: { name: string; renewal_date: string; days_left: number; status: string }[] | null;
  cityscreens: { player_id: string; name: string; location: string; mode: string; last_seen: string; active: boolean }[] | null;
  mailroom: { total: number; today: number; week: number; by_priority: Record<string, number>; recent_by_priority: Record<string, number> } | null;
  unbilled: { total_hours: number; total_amount: number; entry_count: number; by_client: Record<string, number> } | null;
  timeentries: { description: string; duration: number; status: string; start_time: string; project: string; client: string }[] | null;
  aiUsage: AiUsage | null;
  /** Time this response was generated, not the age of the underlying signals. */
  generatedAt: string;
  /** Kept for older clients; equivalent to generatedAt. */
  lastUpdated: string;
  freshness: DashboardFreshness;
}

async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json();
}

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
