import { issueSessionCookie, verifyPassword } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/login { password } -> Set-Cookie + { ok: true }
// A wrong password, a missing password and an unconfigured server all answer
// the same 401 so the response cannot be used to probe which it was.

const MAX_BODY_BYTES = 1024;
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Single-instance app, so an in-memory map is enough. Entries are pruned on
// the way through instead of by a timer, which keeps this dependency-free.
const failures = new Map<string, { count: number; first: number }>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function isLimited(ip: string, now: number): boolean {
  for (const [key, entry] of failures) {
    if (now - entry.first > WINDOW_MS) failures.delete(key);
  }
  const entry = failures.get(ip);
  return !!entry && entry.count >= MAX_FAILURES;
}

function recordFailure(ip: string, now: number): void {
  const entry = failures.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    failures.set(ip, { count: 1, first: now });
  } else {
    entry.count += 1;
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const now = Date.now();
  if (isLimited(ip, now)) {
    return Response.json({ error: "too many attempts" }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "body too large" }, { status: 413 });
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "body too large" }, { status: 413 });
  }

  let password: unknown;
  try {
    password = (JSON.parse(text) as { password?: unknown })?.password;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof password !== "string" || !verifyPassword(password)) {
    recordFailure(ip, now);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  failures.delete(ip);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": issueSessionCookie(), "Cache-Control": "no-store" } });
}
