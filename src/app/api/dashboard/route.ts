import { getDb } from "@/lib/db";
import type { ServerHealth, BackupStatus, UptimeCheck, CronJob, Project, IntegrationHealth, Alert } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  // Latest health per server (most recent entry per server_name)
  const servers = db.prepare(`
    SELECT * FROM server_health
    WHERE id IN (
      SELECT MAX(id) FROM server_health GROUP BY server_name
    )
    ORDER BY server_name
  `).all() as ServerHealth[];

  // Latest backup status per backup_name
  const backups = db.prepare(`
    SELECT * FROM backup_status
    WHERE id IN (
      SELECT MAX(id) FROM backup_status GROUP BY backup_name
    )
    ORDER BY backup_name
  `).all() as BackupStatus[];

  // Latest uptime check per site
  const uptime = db.prepare(`
    SELECT * FROM uptime_checks
    WHERE id IN (
      SELECT MAX(id) FROM uptime_checks GROUP BY site_url
    )
    ORDER BY site_name
  `).all() as UptimeCheck[];

  // Uptime history (last 48 checks per site for sparkline)
  const uptimeHistory = db.prepare(`
    SELECT site_url, site_name, is_up, response_time_ms, checked_at
    FROM uptime_checks
    WHERE checked_at > datetime('now', '-24 hours')
    ORDER BY site_url, checked_at DESC
  `).all() as UptimeCheck[];

  // Latest cron status
  const crons = db.prepare(`
    SELECT * FROM cron_status
    WHERE id IN (
      SELECT MAX(id) FROM cron_status GROUP BY server_name, cron_name
    )
    ORDER BY server_name, cron_name
  `).all() as CronJob[];

  // Projects
  const projects = db.prepare("SELECT * FROM projects ORDER BY name").all() as Project[];

  // Latest integration health
  const integrations = db.prepare(`
    SELECT * FROM integration_health
    WHERE id IN (
      SELECT MAX(id) FROM integration_health GROUP BY integration_name
    )
    ORDER BY integration_name
  `).all() as IntegrationHealth[];

  // Active alerts
  const alerts = db.prepare(
    "SELECT * FROM alerts WHERE resolved = 0 ORDER BY severity DESC, created_at DESC"
  ).all() as Alert[];

  // Server health history (last 24h for charts)
  const serverHistory = db.prepare(`
    SELECT server_name, disk_usage_percent, ram_usage_percent, cpu_usage_percent, checked_at
    FROM server_health
    WHERE checked_at > datetime('now', '-24 hours')
    ORDER BY server_name, checked_at
  `).all() as ServerHealth[];

  // Extra data from kv_store
  const getKv = (key: string) => {
    try {
      const row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get(key) as { value: string } | undefined;
      return row ? JSON.parse(row.value) : null;
    } catch { return null; }
  };

  return Response.json({
    servers,
    backups,
    uptime,
    uptimeHistory,
    crons,
    projects,
    integrations,
    alerts,
    serverHistory,
    inboxes: getKv("inboxes"),
    domains: getKv("domains"),
    cityscreens: getKv("cityscreens"),
    mailroom: getKv("mailroom"),
    unbilled: getKv("unbilled"),
    timeentries: getKv("timeentries"),
    lastUpdated: new Date().toISOString(),
  });
}
