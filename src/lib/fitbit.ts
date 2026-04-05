import { getDb } from "./db";
import crypto from "crypto";

const FITBIT_CLIENT_ID = process.env.FITBIT_CLIENT_ID || "";
const FITBIT_CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET || "";
const FITBIT_REDIRECT_URI = process.env.FITBIT_REDIRECT_URI || "https://cockpit.sbxs.io/api/fitbit/callback";

function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS fitbit_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      user_id TEXT,
      updated_at DATETIME DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function generateAuthUrl(): { url: string; codeVerifier: string } {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

  const params = new URLSearchParams({
    response_type: "code",
    client_id: FITBIT_CLIENT_ID,
    redirect_uri: FITBIT_REDIRECT_URI,
    scope: "weight profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: `https://www.fitbit.com/oauth2/authorize?${params}`,
    codeVerifier,
  };
}

export async function exchangeCode(code: string, codeVerifier: string) {
  const basic = Buffer.from(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: FITBIT_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitbit token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token, data.expires_in, data.user_id);
  return data;
}

function saveTokens(accessToken: string, refreshToken: string, expiresIn: number, userId?: string) {
  const db = ensureTable();
  const expiresAt = Date.now() + expiresIn * 1000;

  db.prepare(`
    INSERT INTO fitbit_tokens (id, access_token, refresh_token, expires_at, user_id)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      user_id = COALESCE(excluded.user_id, fitbit_tokens.user_id),
      updated_at = datetime('now')
  `).run(accessToken, refreshToken, expiresAt, userId || null);
}

async function refreshAccessToken(): Promise<string> {
  const db = ensureTable();
  const row = db.prepare("SELECT * FROM fitbit_tokens WHERE id = 1").get() as {
    access_token: string; refresh_token: string; expires_at: number; user_id: string;
  } | undefined;

  if (!row) throw new Error("No Fitbit tokens stored. Complete OAuth flow first.");

  // Return current token if still valid (with 5 min buffer)
  if (row.expires_at > Date.now() + 300000) {
    return row.access_token;
  }

  const basic = Buffer.from(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitbit refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token, data.expires_in, data.user_id);
  return data.access_token;
}

export async function fetchWeight(startDate: string, endDate: string) {
  const token = await refreshAccessToken();

  const res = await fetch(
    `https://api.fitbit.com/1/user/-/body/log/weight/date/${startDate}/${endDate}.json`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitbit weight fetch failed: ${res.status} ${text}`);
  }

  return await res.json();
}

export async function syncWeightData() {
  const db = ensureTable();

  // Get last 30 days of weight data
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const data = await fetchWeight(startDate, endDate);

  if (!data.weight || !Array.isArray(data.weight)) return { synced: 0 };

  // Ensure weight table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_weight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weight_kg REAL NOT NULL,
      recorded_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  let synced = 0;
  for (const entry of data.weight) {
    const recordedAt = `${entry.date}T${entry.time || "00:00:00"}`;
    const weightKg = entry.weight; // Fitbit returns in user's unit; assume kg

    // Avoid duplicates (check if we already have a weight for this exact datetime)
    const existing = db.prepare(
      "SELECT id FROM health_weight WHERE recorded_at = ?"
    ).get(recordedAt);

    if (!existing) {
      db.prepare("INSERT INTO health_weight (weight_kg, recorded_at) VALUES (?, ?)").run(weightKg, recordedAt);
      synced++;
    }
  }

  return { synced, total: data.weight.length };
}

export function isConnected(): boolean {
  try {
    const db = ensureTable();
    const row = db.prepare("SELECT id FROM fitbit_tokens WHERE id = 1").get();
    return !!row;
  } catch {
    return false;
  }
}
