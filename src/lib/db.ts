import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Use /app/data for persistent volume in production (Coolify mounts here)
// Falls back to cwd/data for local development and build
function getDbPath() {
  // Explicit override, used by tests to point at a throwaway file so they
  // never open the real cockpit.db.
  if (process.env.COCKPIT_DB_PATH) {
    fs.mkdirSync(path.dirname(process.env.COCKPIT_DB_PATH), { recursive: true });
    return process.env.COCKPIT_DB_PATH;
  }
  if (process.env.NODE_ENV === "production") {
    try {
      fs.mkdirSync("/app/data", { recursive: true });
      return "/app/data/cockpit.db";
    } catch {
      // During build, /app/data may not be writable
    }
  }
  const fallback = path.join(process.cwd(), "data", "cockpit.db");
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database) {
  // Add columns if they don't exist (safe to re-run)
  const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has("session_active")) {
    db.exec("ALTER TABLE projects ADD COLUMN session_active BOOLEAN DEFAULT 0");
  }
  if (!colNames.has("last_activity_at")) {
    db.exec("ALTER TABLE projects ADD COLUMN last_activity_at DATETIME");
  }

  // Add checked_path to uptime_checks for subpage monitoring
  const uptimeCols = db.prepare("PRAGMA table_info(uptime_checks)").all() as { name: string }[];
  const uptimeColNames = new Set(uptimeCols.map((c) => c.name));

  if (!uptimeColNames.has("checked_path")) {
    db.exec("ALTER TABLE uptime_checks ADD COLUMN checked_path TEXT NOT NULL DEFAULT '/'");
  }

  // Add last_notified_at to alerts for escalation tracking
  const alertCols = db.prepare("PRAGMA table_info(alerts)").all() as { name: string }[];
  const alertColNames = new Set(alertCols.map((c) => c.name));

  if (!alertColNames.has("last_notified_at")) {
    db.exec("ALTER TABLE alerts ADD COLUMN last_notified_at DATETIME");
  }

  // Connections (formerly "integrations"): a row must be able to say what the
  // connection is for, when data last actually moved through it, and how to fix
  // it. `last_check_at` is when we last asked; `last_flow_at` is when the thing
  // last did its job. A connection can answer the first question happily while
  // failing the second for weeks, which is exactly the failure this surfaces.
  const integrationCols = db.prepare("PRAGMA table_info(integration_health)").all() as { name: string }[];
  const integrationColNames = new Set(integrationCols.map((c) => c.name));

  if (!integrationColNames.has("purpose")) {
    db.exec("ALTER TABLE integration_health ADD COLUMN purpose TEXT");
  }
  if (!integrationColNames.has("last_flow_at")) {
    db.exec("ALTER TABLE integration_health ADD COLUMN last_flow_at DATETIME");
  }
  if (!integrationColNames.has("fix")) {
    db.exec("ALTER TABLE integration_health ADD COLUMN fix TEXT");
  }

  // Layout profiles: an early hand-made table from the masterplan could exist
  // without the revision column that optimistic concurrency depends on.
  const layoutCols = db.prepare("PRAGMA table_info(dashboard_layout_profiles)").all() as { name: string }[];
  const layoutColNames = new Set(layoutCols.map((c) => c.name));

  if (layoutCols.length > 0 && !layoutColNames.has("revision")) {
    db.exec("ALTER TABLE dashboard_layout_profiles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_name TEXT NOT NULL,
      disk_total_gb REAL DEFAULT 0,
      disk_used_gb REAL DEFAULT 0,
      disk_usage_percent REAL DEFAULT 0,
      ram_total_mb REAL DEFAULT 0,
      ram_used_mb REAL DEFAULT 0,
      ram_usage_percent REAL DEFAULT 0,
      cpu_usage_percent REAL DEFAULT 0,
      uptime_seconds INTEGER DEFAULT 0,
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gpu_metric_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gpu_index INTEGER NOT NULL,
      gpu_uuid TEXT NOT NULL,
      gpu_name TEXT NOT NULL,
      utilization_percent REAL,
      memory_used_mb REAL,
      memory_total_mb REAL,
      temperature_c REAL,
      power_draw_w REAL,
      power_limit_w REAL,
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS host_thermal_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      cpu_tctl_c REAL,
      cpu_tccd_c REAL,
      board_temp_c REAL,
      nvme_max_c REAL,
      ram_max_c REAL,
      fan_cpu_rpm REAL,
      fan_pump_rpm REAL,
      fan_case_rpm REAL,
      pwm_cpu_percent REAL,
      pwm_pump_percent REAL,
      pwm_case_percent REAL,
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backup_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_name TEXT NOT NULL,
      source TEXT DEFAULT '',
      target TEXT DEFAULT '',
      expected_interval_hours INTEGER DEFAULT 24,
      last_backup_at DATETIME,
      size_mb REAL,
      status TEXT DEFAULT 'unknown',
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS uptime_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_url TEXT NOT NULL,
      site_name TEXT NOT NULL,
      checked_path TEXT NOT NULL DEFAULT '/',
      status_code INTEGER,
      response_time_ms INTEGER,
      is_up BOOLEAN DEFAULT 0,
      ssl_expiry_date DATETIME,
      ssl_days_remaining INTEGER,
      domain_expiry_date DATETIME,
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cron_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_name TEXT NOT NULL,
      cron_name TEXT NOT NULL,
      schedule TEXT DEFAULT '',
      schedule_human TEXT DEFAULT '',
      last_run_at DATETIME,
      exit_code INTEGER,
      output_snippet TEXT,
      status TEXT DEFAULT 'unknown',
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT DEFAULT '',
      project_type TEXT DEFAULT '',
      client_name TEXT,
      github_url TEXT,
      ddev_running BOOLEAN DEFAULT 0,
      last_commit_at DATETIME,
      last_commit_message TEXT,
      memory_files_count INTEGER DEFAULT 0,
      session_active BOOLEAN DEFAULT 0,
      last_activity_at DATETIME,
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS integration_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_name TEXT NOT NULL,
      category TEXT DEFAULT '',
      status TEXT DEFAULT 'unknown',
      last_check_at DATETIME,
      details TEXT,
      purpose TEXT,
      last_flow_at DATETIME,
      fix TEXT,
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL DEFAULT 'warning',
      category TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      resolved BOOLEAN DEFAULT 0,
      notified BOOLEAN DEFAULT 0,
      last_notified_at DATETIME,
      created_at DATETIME DEFAULT (datetime('now')),
      resolved_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'modify',
      project TEXT,
      changed_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_file_changes_time
      ON file_changes(changed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_server_health_checked
      ON server_health(server_name, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_host_thermal_history_checked
      ON host_thermal_history(host, checked_at);

    CREATE INDEX IF NOT EXISTS idx_gpu_metric_history_checked
      ON gpu_metric_history(gpu_uuid, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_uptime_checked
      ON uptime_checks(site_url, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_active
      ON alerts(resolved, created_at DESC);

    CREATE TABLE IF NOT EXISTS dashboard_layout_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS layout_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at DATETIME NOT NULL DEFAULT (datetime('now')),
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      revision INTEGER,
      summary TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_layout_audit_at
      ON layout_audit_log(at DESC);
  `);
}
