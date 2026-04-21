export interface ServerHealth {
  id: number;
  server_name: string;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_usage_percent: number;
  ram_total_mb: number;
  ram_used_mb: number;
  ram_usage_percent: number;
  cpu_usage_percent: number;
  uptime_seconds: number;
  checked_at: string;
}

export interface BackupStatus {
  id: number;
  backup_name: string;
  source: string;
  target: string;
  expected_interval_hours: number;
  last_backup_at: string | null;
  size_mb: number | null;
  status: "ok" | "warning" | "critical" | "unknown";
  checked_at: string;
}

export interface UptimeCheck {
  id: number;
  site_url: string;
  site_name: string;
  checked_path: string;
  status_code: number | null;
  response_time_ms: number | null;
  is_up: boolean;
  ssl_expiry_date: string | null;
  ssl_days_remaining: number | null;
  domain_expiry_date: string | null;
  checked_at: string;
}

export interface CronJob {
  id: number;
  server_name: string;
  cron_name: string;
  schedule: string;
  schedule_human: string;
  last_run_at: string | null;
  exit_code: number | null;
  output_snippet: string | null;
  status: "ok" | "warning" | "critical" | "unknown";
  checked_at: string;
}

export interface Project {
  id: number;
  name: string;
  path: string;
  project_type: string;
  client_name: string | null;
  github_url: string | null;
  ddev_running: boolean;
  last_commit_at: string | null;
  last_commit_message: string | null;
  memory_files_count: number;
  session_active: boolean;
  last_activity_at: string | null;
  checked_at: string;
}

export interface IntegrationHealth {
  id: number;
  integration_name: string;
  category: string;
  status: "ok" | "warning" | "critical";
  last_check_at: string;
  details: string | null;
  checked_at: string;
}

export interface Alert {
  id: number;
  severity: "critical" | "warning";
  category: string;
  source: string;
  message: string;
  resolved: boolean;
  notified: boolean;
  last_notified_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface UptimeSite {
  url: string;
  name: string;
  check_interval_seconds: number;
  paths?: string[];
}

export interface StatusPayload {
  source: string;
  timestamp: string;
  servers?: Omit<ServerHealth, "id" | "checked_at">[];
  backups?: Omit<BackupStatus, "id" | "checked_at">[];
  crons?: Omit<CronJob, "id" | "checked_at">[];
  projects?: Omit<Project, "id" | "checked_at">[];
  integrations?: Omit<IntegrationHealth, "id" | "checked_at">[];
}
