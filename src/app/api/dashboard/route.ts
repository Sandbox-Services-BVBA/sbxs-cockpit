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

  // Latest uptime check per site+path
  const uptimeAll = db.prepare(`
    SELECT * FROM uptime_checks
    WHERE id IN (
      SELECT MAX(id) FROM uptime_checks GROUP BY site_url, checked_path
    )
    ORDER BY site_name, checked_path
  `).all() as UptimeCheck[];

  // Aggregate to one entry per site for the grid (worst-case across paths)
  // but include failing paths detail
  const uptimeBySite = new Map<string, UptimeCheck & { failing_paths?: string[] }>();
  for (const check of uptimeAll) {
    const existing = uptimeBySite.get(check.site_url);
    if (!existing) {
      uptimeBySite.set(check.site_url, { ...check, failing_paths: check.is_up ? [] : [check.checked_path] });
    } else {
      // Site is down if ANY path is down
      if (!check.is_up) {
        existing.is_up = false;
        existing.failing_paths = existing.failing_paths || [];
        existing.failing_paths.push(check.checked_path);
      }
      // Use root path's SSL info
      if (check.checked_path === "/" && check.ssl_expiry_date) {
        existing.ssl_expiry_date = check.ssl_expiry_date;
        existing.ssl_days_remaining = check.ssl_days_remaining;
      }
      // Use root path's response time for the main display
      if (check.checked_path === "/") {
        existing.response_time_ms = check.response_time_ms;
        existing.status_code = check.status_code;
      }
    }
  }
  const uptime = Array.from(uptimeBySite.values());

  // Uptime history: aggregate per site per check round (group by site_url + checked_at)
  // For the sparkline, a site is "up" at a given time only if ALL paths were up
  const uptimeHistory = db.prepare(`
    SELECT site_url, site_name, checked_path, is_up, response_time_ms, checked_at
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
