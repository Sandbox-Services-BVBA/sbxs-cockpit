import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Reset the sobriety counter: insert a fresh row, the widget always reads the
// latest one. No auth — dashboard is Tailscale-only, same as the ventilation
// and home-control routes.
export async function POST(request: Request) {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS health_sobriety (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  const body = await request.json().catch(() => ({}));

  let start = new Date();
  if (body.start_date) {
    start = new Date(body.start_date);
    if (isNaN(start.getTime())) {
      return Response.json({ error: "Invalid start_date" }, { status: 400 });
    }
    if (start.getTime() > Date.now() + 60000) {
      return Response.json({ error: "start_date cannot be in the future" }, { status: 400 });
    }
  }

  const startDate = start.toISOString();
  db.prepare("INSERT INTO health_sobriety (start_date, label) VALUES (?, ?)").run(
    startDate,
    "reset from dashboard"
  );

  return Response.json({ ok: true, start_date: startDate });
}
