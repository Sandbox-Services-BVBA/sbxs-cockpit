import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS health_sobriety (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS health_weight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weight_kg REAL NOT NULL,
      source TEXT DEFAULT 'manual',
      recorded_at DATETIME NOT NULL,
      UNIQUE(recorded_at)
    );
  `);

  const sobriety = db.prepare("SELECT * FROM health_sobriety ORDER BY id DESC LIMIT 1").get() as {
    id: number; start_date: string; label: string;
  } | undefined;

  // Weight: support ?period=2m, 6m, 1y, 2y, 5y (default 2m)
  const period = request.nextUrl.searchParams.get("period") || "2m";
  const periodDays: Record<string, number> = {
    "2m": 60, "6m": 180, "1y": 365, "2y": 730, "5y": 1825,
  };
  const days = periodDays[period] || 60;

  const weights = db.prepare(`
    SELECT weight_kg, source, recorded_at
    FROM health_weight
    WHERE recorded_at > datetime('now', ?)
    ORDER BY recorded_at ASC
  `).all(`-${days} days`) as { weight_kg: number; source: string; recorded_at: string }[];

  // Also get today's latest for the big number
  const todayWeight = db.prepare(`
    SELECT weight_kg, recorded_at
    FROM health_weight
    WHERE date(recorded_at) = date('now')
    ORDER BY recorded_at DESC LIMIT 1
  `).get() as { weight_kg: number; recorded_at: string } | undefined;

  // Total count for stats
  const totalCount = (db.prepare("SELECT COUNT(*) as c FROM health_weight").get() as { c: number }).c;

  return Response.json({ sobriety, weights, todayWeight, totalCount, period });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${config.apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_sobriety (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date TEXT NOT NULL,
      label TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS health_weight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weight_kg REAL NOT NULL,
      source TEXT DEFAULT 'manual',
      recorded_at DATETIME NOT NULL,
      UNIQUE(recorded_at)
    );
  `);

  const body = await request.json();

  if (body.type === "sobriety") {
    db.prepare("INSERT INTO health_sobriety (start_date, label) VALUES (?, ?)").run(
      body.start_date, body.label || ""
    );
    return Response.json({ ok: true });
  }

  if (body.type === "weight") {
    db.prepare(
      "INSERT OR IGNORE INTO health_weight (weight_kg, source, recorded_at) VALUES (?, 'manual', datetime('now'))"
    ).run(body.weight_kg);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown type" }, { status: 400 });
}
