import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// GET health data (sobriety, weight)
export async function GET() {
  const db = getDb();

  // Ensure health tables exist
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
      recorded_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  const sobriety = db.prepare("SELECT * FROM health_sobriety ORDER BY id DESC LIMIT 1").get() as {
    id: number; start_date: string; label: string;
  } | undefined;

  const weights = db.prepare(
    "SELECT * FROM health_weight ORDER BY recorded_at DESC LIMIT 30"
  ).all() as { id: number; weight_kg: number; recorded_at: string }[];

  return Response.json({ sobriety, weights });
}

// POST to update sobriety start date or log weight
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
      recorded_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  const body = await request.json();

  if (body.type === "sobriety") {
    db.prepare("INSERT INTO health_sobriety (start_date, label) VALUES (?, ?)").run(
      body.start_date,
      body.label || ""
    );
    return Response.json({ ok: true });
  }

  if (body.type === "weight") {
    db.prepare("INSERT INTO health_weight (weight_kg) VALUES (?)").run(body.weight_kg);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown type" }, { status: 400 });
}
