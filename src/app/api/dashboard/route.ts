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

  // The client renders 24 check rounds per site. Bound this in SQL instead of
  // shipping every path check from the last 24 hours on each 30-second poll.
  const uptimeHistory = db.prepare(`
    WITH ranked AS (
      SELECT site_url, site_name, checked_path, is_up, response_time_ms, checked_at,
        DENSE_RANK() OVER (
          PARTITION BY site_url ORDER BY checked_at DESC
        ) AS check_rank
      FROM uptime_checks
    )
    SELECT site_url, site_name, checked_path, is_up, response_time_ms, checked_at
    FROM ranked
    WHERE check_rank <= 24
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

  // Extra data from kv_store
  const getKv = (key: string) => {
    try {
      const row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get(key) as { value: string } | undefined;
      return row ? JSON.parse(row.value) : null;
    } catch { return null; }
  };

  const latestTimestamp = (query: string, params: string[] = []) => {
    try {
      const row = db.prepare(query).get(...params) as { timestamp: string | null } | undefined;
      return row?.timestamp ?? null;
    } catch {
      return null;
    }
  };

  // Services: agent-reported running-state, enriched with the real-time "last
  // heartbeat" derived from the file-watcher's file_changes (hybrid liveness).
  const beats = db
    .prepare(
      `SELECT project AS name, MAX(changed_at) AS last_beat
       FROM file_changes WHERE project IS NOT NULL GROUP BY project`
    )
    .all() as { name: string; last_beat: string }[];
  const beatMap = new Map(beats.map((b) => [b.name, b.last_beat]));
  const servicesRaw = getKv("services") as Array<Record<string, unknown>> | null;
  const services = servicesRaw
    ? servicesRaw.map((s) => ({ ...s, last_beat: beatMap.get(s.name as string) ?? null }))
    : null;

  const generatedAt = new Date().toISOString();
  const freshness = {
    // Server health is present in every cockpit-agent payload and is therefore
    // the heartbeat for the entire multi-source ingestion pipeline.
    agent: latestTimestamp("SELECT MAX(checked_at) AS timestamp FROM server_health"),
    uptime: latestTimestamp("SELECT MAX(checked_at) AS timestamp FROM uptime_checks"),
    business: latestTimestamp(
      `SELECT MAX(updated_at) AS timestamp FROM kv_store
       WHERE key IN (?, ?, ?, ?, ?)`,
      ["inboxes", "mailroom", "unbilled", "timeentries", "domains"]
    ),
  };

  return Response.json({
    servers,
    services,
    backups,
    uptime,
    uptimeHistory,
    crons,
    projects,
    integrations,
    alerts,
    inboxes: getKv("inboxes"),
    domains: getKv("domains"),
    cityscreens: getKv("cityscreens"),
    mailroom: getKv("mailroom"),
    unbilled: getKv("unbilled"),
    timeentries: getKv("timeentries"),
    generatedAt,
    lastUpdated: generatedAt,
    freshness,
  });
}
