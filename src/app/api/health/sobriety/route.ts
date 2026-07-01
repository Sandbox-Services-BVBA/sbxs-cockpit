import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Reset the sobriety counter: insert a fresh row, the widget always reads the
// latest one. No auth — dashboard is Tailscale-only, same as the ventilation
// and home-control routes.
export async function POST() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS health_sobriety (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  const startDate = new Date().toISOString();
  db.prepare("INSERT INTO health_sobriety (start_date, label) VALUES (?, ?)").run(
    startDate,
    "reset from dashboard"
  );

  return Response.json({ ok: true, start_date: startDate });
}
