import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createAlert, resolveAlerts } from "@/lib/alerts";
import { config } from "@/lib/config";
import type { StatusPayload } from "@/types";

export async function POST(request: NextRequest) {
  // Authenticate
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${config.apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload: StatusPayload = await request.json();
  const db = getDb();

  // Ingest server health
  if (payload.servers) {
    const stmt = db.prepare(`
      INSERT INTO server_health (server_name, disk_total_gb, disk_used_gb, disk_usage_percent,
        ram_total_mb, ram_used_mb, ram_usage_percent, cpu_usage_percent, uptime_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of payload.servers) {
      stmt.run(
        s.server_name, s.disk_total_gb, s.disk_used_gb, s.disk_usage_percent,
        s.ram_total_mb, s.ram_used_mb, s.ram_usage_percent, s.cpu_usage_percent, s.uptime_seconds
      );

      // Check disk alerts
      if (s.disk_usage_percent >= config.alerts.diskCriticalPercent) {
        createAlert("critical", "disk", s.server_name, `Disk at ${s.disk_usage_percent.toFixed(1)}%`);
      } else if (s.disk_usage_percent >= config.alerts.diskWarningPercent) {
        createAlert("warning", "disk", s.server_name, `Disk at ${s.disk_usage_percent.toFixed(1)}%`);
      } else {
        resolveAlerts("disk", s.server_name);
      }
    }
  }

  // Ingest backup status
  if (payload.backups) {
    const stmt = db.prepare(`
      INSERT INTO backup_status (backup_name, source, target, expected_interval_hours,
        last_backup_at, size_mb, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const b of payload.backups) {
      stmt.run(
        b.backup_name, b.source, b.target, b.expected_interval_hours,
        b.last_backup_at, b.size_mb, b.status
      );

      if (b.status === "critical") {
        createAlert("critical", "backup", b.backup_name, "Backup is stale or failed");
      } else if (b.status === "ok") {
        resolveAlerts("backup", b.backup_name);
      }
    }
  }

  // Ingest cron status
  if (payload.crons) {
    const stmt = db.prepare(`
      INSERT INTO cron_status (server_name, cron_name, schedule, schedule_human,
        last_run_at, exit_code, output_snippet, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of payload.crons) {
      stmt.run(
        c.server_name, c.cron_name, c.schedule, c.schedule_human,
        c.last_run_at, c.exit_code, c.output_snippet, c.status
      );

      if (c.status === "critical" || (c.exit_code !== null && c.exit_code !== 0)) {
        createAlert("warning", "cron", `${c.server_name}/${c.cron_name}`, `Cron failed (exit ${c.exit_code})`);
      } else if (c.status === "ok") {
        resolveAlerts("cron", `${c.server_name}/${c.cron_name}`);
      }
    }
  }

  // Ingest projects
  if (payload.projects) {
    // Clear old project data and insert fresh
    db.prepare("DELETE FROM projects").run();
    const stmt = db.prepare(`
      INSERT INTO projects (name, path, project_type, client_name, github_url,
        ddev_running, last_commit_at, last_commit_message, memory_files_count,
        session_active, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of payload.projects) {
      stmt.run(
        p.name, p.path, p.project_type, p.client_name, p.github_url,
        p.ddev_running ? 1 : 0, p.last_commit_at, p.last_commit_message, p.memory_files_count,
        (p as Record<string, unknown>).session_active ? 1 : 0,
        (p as Record<string, unknown>).last_activity_at || null
      );
    }
  }

  // Ingest integration health
  if (payload.integrations) {
    const stmt = db.prepare(`
      INSERT INTO integration_health (integration_name, category, status, last_check_at, details)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const i of payload.integrations) {
      stmt.run(i.integration_name, i.category, i.status, i.last_check_at, i.details);

      if (i.status === "critical") {
        createAlert("warning", "integration", i.integration_name, `Integration down: ${i.details || "unknown"}`);
      } else if (i.status === "ok") {
        resolveAlerts("integration", i.integration_name);
      }
    }
  }

  // Store extra JSON payloads (inboxes, domains, cityscreens, mailroom)
  db.exec(`CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT (datetime('now'))
  )`);

  const kvStmt = db.prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)");
  const body = payload as unknown as Record<string, unknown>;
  for (const key of ["inboxes", "domains", "cityscreens", "mailroom", "unbilled", "timeentries"]) {
    if (body[key]) {
      kvStmt.run(key, JSON.stringify(body[key]));
    }
  }

  return Response.json({ ok: true, timestamp: new Date().toISOString() });
}
