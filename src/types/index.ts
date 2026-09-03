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

export interface GpuDeviceMetric {
  gpu_index: number;
  gpu_uuid: string;
  gpu_name: string;
  utilization_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  temperature_c: number | null;
  power_draw_w: number | null;
  power_limit_w: number | null;
}

export interface GpuStatus {
  available: boolean;
  devices: GpuDeviceMetric[];
  captured_at: string;
  error?: string | null;
}

export interface GpuMetricHistory extends GpuDeviceMetric {
  id: number;
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
  /** When we last asked the connection about itself. */
  last_check_at: string;
  details: string | null;
  /** What this connection is for, so the consequence of it being down is visible. */
  purpose: string | null;
  /** When data last actually moved through it. Null means never, or not measurable. */
  last_flow_at: string | null;
  /** Operator-ready recovery steps, newline separated. Shown inline when unhealthy. */
  fix: string | null;
  checked_at: string;
}

/**
 * What the agent posts. The three connection fields are optional so an older
 * agent build (or a collector that cannot measure flow) still ingests cleanly.
 */
export type IntegrationHealthInput = Omit<
  IntegrationHealth,
  "id" | "checked_at" | "purpose" | "last_flow_at" | "fix"
> & {
  purpose?: string | null;
  last_flow_at?: string | null;
  fix?: string | null;
};

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

export interface Service {
  name: string;
  running: number; // 0 | 1 from the agent
  uptime_seconds: number;
  detail: string | null;
  checked_at: string;
  last_beat: string | null; // from file_changes, enriched server-side
}

export interface AiProviderUsage {
  ok: boolean;
  error?: string | null;
  plan?: string | null;
  session_pct: number | null;
  session_resets_at: string | null;
  weekly_pct: number | null;
  weekly_resets_at: string | null;
  weekly_model_pct?: number | null;
  weekly_model_name?: string | null;
  captured_at: string | null;
}

export interface AiUsage {
  claude: AiProviderUsage | null;
  codex: AiProviderUsage | null;
}

export interface FileChange {
  id: number;
  path: string;
  action: "create" | "modify" | "delete" | "move";
  project: string | null;
  changed_at: string;
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
  gpu?: GpuStatus;
  backups?: Omit<BackupStatus, "id" | "checked_at">[];
  crons?: Omit<CronJob, "id" | "checked_at">[];
  projects?: Omit<Project, "id" | "checked_at">[];
  integrations?: IntegrationHealthInput[];
}
