"use client";

import { useState, useEffect, useCallback } from "react";
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

export function useDashboardData(refreshInterval = 30000) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refresh: fetchData };
}
