import { getDb } from "./db";
import { sendTelegramMessage, formatAlert, formatRecovery } from "./telegram";
import { config } from "./config";
import type { Alert } from "@/types";

export function createAlert(
  severity: "critical" | "warning",
  category: string,
  source: string,
  message: string
): Alert {
  const db = getDb();

  // Check if there's already an active alert for this source/category
  const existing = db
    .prepare("SELECT id FROM alerts WHERE category = ? AND source = ? AND resolved = 0")
    .get(category, source) as { id: number } | undefined;

  if (existing) {
    // Update existing alert
    db.prepare("UPDATE alerts SET message = ?, severity = ? WHERE id = ?").run(
      message,
      severity,
      existing.id
    );
    return db.prepare("SELECT * FROM alerts WHERE id = ?").get(existing.id) as Alert;
  }

  const result = db
    .prepare(
      "INSERT INTO alerts (severity, category, source, message) VALUES (?, ?, ?, ?)"
    )
    .run(severity, category, source, message);

  return db.prepare("SELECT * FROM alerts WHERE id = ?").get(result.lastInsertRowid) as Alert;
}

export function resolveAlerts(category: string, source: string) {
  const db = getDb();
  const active = db
    .prepare("SELECT * FROM alerts WHERE category = ? AND source = ? AND resolved = 0")
    .all(category, source) as Alert[];

  if (active.length > 0) {
    db.prepare(
      "UPDATE alerts SET resolved = 1, resolved_at = datetime('now') WHERE category = ? AND source = ? AND resolved = 0"
    ).run(category, source);

    // Send recovery notifications for alerts that were already notified
    for (const alert of active) {
      if (alert.notified) {
        const createdAt = new Date(alert.created_at + "Z").getTime();
        const downMinutes = Math.floor((Date.now() - createdAt) / 60000);
        const duration = downMinutes > 0 ? ` (was down ${formatDuration(downMinutes)})` : "";
        sendTelegramMessage(formatRecovery(category, source, `Resolved${duration}`));
      }
    }
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export async function processAlertNotifications() {
  const db = getDb();

  // 1. Send NEW critical alerts immediately
  const criticals = db
    .prepare("SELECT * FROM alerts WHERE severity = 'critical' AND notified = 0 AND resolved = 0")
    .all() as Alert[];

  for (const alert of criticals) {
    await sendTelegramMessage(formatAlert(alert.severity, alert.category, alert.source, alert.message));
    db.prepare("UPDATE alerts SET notified = 1, last_notified_at = datetime('now') WHERE id = ?").run(alert.id);
  }

  // 2. Escalation: re-notify for unresolved critical alerts that have been open too long
  const { escalationFirstMinutes, escalationRepeatMinutes } = config.alerts;
  const escalationCandidates = db
    .prepare("SELECT * FROM alerts WHERE severity = 'critical' AND notified = 1 AND resolved = 0")
    .all() as Alert[];

  for (const alert of escalationCandidates) {
    const createdAt = new Date(alert.created_at + "Z").getTime();
    const lastNotified = alert.last_notified_at
      ? new Date(alert.last_notified_at + "Z").getTime()
      : createdAt;
    const now = Date.now();
    const minutesSinceCreated = Math.floor((now - createdAt) / 60000);
    const minutesSinceLastNotified = Math.floor((now - lastNotified) / 60000);

    // Determine if we should re-notify
    let shouldEscalate = false;
    if (minutesSinceCreated >= escalationFirstMinutes && minutesSinceLastNotified >= escalationFirstMinutes) {
      // First escalation window
      shouldEscalate = true;
    }
    if (minutesSinceCreated >= escalationFirstMinutes + escalationRepeatMinutes && minutesSinceLastNotified >= escalationRepeatMinutes) {
      // Subsequent hourly reminders
      shouldEscalate = true;
    }

    if (shouldEscalate) {
      const duration = formatDuration(minutesSinceCreated);
      await sendTelegramMessage(
        `<b>[STILL DOWN - ${duration}]</b>\n${alert.source}: ${alert.message}`
      );
      db.prepare("UPDATE alerts SET last_notified_at = datetime('now') WHERE id = ?").run(alert.id);
    }
  }

  // 3. Group warnings and send together (new ones only)
  const warnings = db
    .prepare("SELECT * FROM alerts WHERE severity = 'warning' AND notified = 0 AND resolved = 0")
    .all() as Alert[];

  if (warnings.length > 0) {
    const grouped = warnings
      .map((w) => `- ${w.source}: ${w.message}`)
      .join("\n");
    await sendTelegramMessage(`<b>[WARNINGS] ${warnings.length} issue(s)</b>\n${grouped}`);
    const ids = warnings.map((w) => w.id);
    db.prepare(`UPDATE alerts SET notified = 1, last_notified_at = datetime('now') WHERE id IN (${ids.join(",")})`).run();
  }
}
