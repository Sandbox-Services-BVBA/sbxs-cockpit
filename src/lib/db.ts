import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Use /app/data for persistent volume in production (Coolify mounts here)
// Falls back to cwd/data for local development
const DB_PATH = process.env.NODE_ENV === "production"
  ? "/app/data/cockpit.db"
  : path.join(process.cwd(), "data", "cockpit.db");

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
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
      checked_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS integration_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_name TEXT NOT NULL,
      category TEXT DEFAULT '',
      status TEXT DEFAULT 'unknown',
      last_check_at DATETIME,
      details TEXT,
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
      created_at DATETIME DEFAULT (datetime('now')),
      resolved_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_server_health_checked
      ON server_health(server_name, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_uptime_checked
      ON uptime_checks(site_url, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_active
      ON alerts(resolved, created_at DESC);
  `);
}
