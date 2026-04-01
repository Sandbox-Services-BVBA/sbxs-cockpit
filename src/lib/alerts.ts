import { getDb } from "./db";
import { sendTelegramMessage, formatAlert, formatRecovery } from "./telegram";
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
        sendTelegramMessage(formatRecovery(category, source, "Resolved"));
      }
    }
  }
}

export async function processAlertNotifications() {
  const db = getDb();

  // Send critical alerts immediately
  const criticals = db
    .prepare("SELECT * FROM alerts WHERE severity = 'critical' AND notified = 0 AND resolved = 0")
    .all() as Alert[];

  for (const alert of criticals) {
    await sendTelegramMessage(formatAlert(alert.severity, alert.category, alert.source, alert.message));
    db.prepare("UPDATE alerts SET notified = 1 WHERE id = ?").run(alert.id);
  }

  // Group warnings and send together
  const warnings = db
    .prepare("SELECT * FROM alerts WHERE severity = 'warning' AND notified = 0 AND resolved = 0")
    .all() as Alert[];

  if (warnings.length > 0) {
    const grouped = warnings
      .map((w) => `- ${w.source}: ${w.message}`)
      .join("\n");
    await sendTelegramMessage(`<b>[WARNINGS] ${warnings.length} issue(s)</b>\n${grouped}`);
    const ids = warnings.map((w) => w.id);
    db.prepare(`UPDATE alerts SET notified = 1 WHERE id IN (${ids.join(",")})`).run();
  }
}
