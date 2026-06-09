import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";
import type { FileChange } from "@/types";

export const dynamic = "force-dynamic";

interface IncomingEvent {
  path: string;
  action?: string;
  project?: string | null;
  ts?: string; // ISO timestamp; defaults to now
}

// Watcher on the dev server pushes batches of file-change events here.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${config.apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { events?: IncomingEvent[] };
  const events = Array.isArray(body.events) ? body.events : [];
  const db = getDb();

  if (events.length > 0) {
    const stmt = db.prepare(
      "INSERT INTO file_changes (path, action, project, changed_at) VALUES (?, ?, ?, ?)"
    );
    const insertMany = db.transaction((rows: IncomingEvent[]) => {
      for (const e of rows) {
        if (!e.path) continue;
        const action = e.action || "modify";
        const ts = e.ts ? e.ts.replace("T", " ").replace("Z", "").split(".")[0] : null;
        stmt.run(e.path, action, e.project || null, ts || new Date().toISOString().replace("T", " ").split(".")[0]);
      }
    });
    insertMany(events);

    // Retain ~3h of history (prune at 4h for margin).
    db.prepare("DELETE FROM file_changes WHERE changed_at < datetime('now', '-4 hours')").run();
  }

  return Response.json({ ok: true, ingested: events.length });
}

// Dashboard widget polls this for the live feed.
// Pass ?since=<id> to fetch only newer rows (incremental, no flashing).
export async function GET(request: NextRequest) {
  const db = getDb();
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since")) || 0;
  const minutes = Math.min(Number(url.searchParams.get("minutes")) || 30, 240);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 4000);

  const changes = (
    since > 0
      ? db
          .prepare(
            `SELECT * FROM file_changes WHERE id > ?
             ORDER BY id DESC LIMIT ?`
          )
          .all(since, limit)
      : db
          .prepare(
            `SELECT * FROM file_changes
             WHERE changed_at > datetime('now', ?)
             ORDER BY id DESC LIMIT ?`
          )
          .all(`-${minutes} minutes`, limit)
  ) as FileChange[];

  const { maxId } = db.prepare("SELECT MAX(id) AS maxId FROM file_changes").get() as {
    maxId: number | null;
  };
  const { n: activeLastMinute } = db
    .prepare(
      "SELECT COUNT(DISTINCT path) AS n FROM file_changes WHERE changed_at > datetime('now', '-60 seconds')"
    )
    .get() as { n: number };

  return Response.json({
    changes,
    lastId: maxId ?? 0,
    activeLastMinute,
    lastUpdated: new Date().toISOString(),
  });
}
