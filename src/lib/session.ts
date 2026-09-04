import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isMachineAuthorized } from "@/lib/api-auth";

// Signed-cookie session that gates dashboard WRITES. Reads stay open: the
// cockpit is Tailscale-fronted and the wallboard runs unattended on a shared
// display, so a read gate would break it. What this protects is Bob's saved
// layout, which no anonymous visitor may rewrite.
//
// The cookie is `<expiresAtMs>.<base64url hmac-sha256(expiresAtMs, secret)>`.
// No state on the server, no dependency, nothing to expire other than time.
// Every check here fails closed: no password configured means no session can
// be issued and no cookie can ever verify.

const COOKIE_NAME = "cockpit_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Read the env at call time rather than module load so tests can set it.
function configuredPassword(): string {
  return process.env.COCKPIT_PASSWORD || "";
}

export function isAuthConfigured(): boolean {
  return configuredPassword().length > 0;
}

// An explicit secret wins; otherwise derive one from the password and the
// machine key so a plain Coolify deploy needs no extra variable. Changing the
// password therefore also invalidates every issued cookie, which is what you
// want after a leak.
function signingSecret(): string | null {
  const explicit = process.env.COCKPIT_SESSION_SECRET;
  if (explicit) return explicit;
  const password = configuredPassword();
  if (!password) return null;
  return createHash("sha256")
    .update(`cockpit-session:${password}:${process.env.COCKPIT_API_KEY || ""}`)
    .digest("hex");
}

function sign(expiresAt: string, secret: string): string {
  return createHmac("sha256", secret).update(expiresAt).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyPassword(input: string): boolean {
  const password = configuredPassword();
  if (!password || typeof input !== "string") return false;
  // Hash both sides so the comparison is constant-time and length-independent.
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}

function cookieAttributes(maxAge: number): string {
  const parts = [`Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=${maxAge}`];
  // `next dev` serves plain http; everywhere else the cookie is TLS-only.
  if (process.env.NODE_ENV !== "development") parts.push("Secure");
  return parts.join("; ");
}

/** A Set-Cookie header value. Throws when no password is configured. */
export function issueSessionCookie(): string {
  const secret = signingSecret();
  if (!secret) throw new Error("session auth is not configured");
  const expiresAt = String(Date.now() + MAX_AGE_SECONDS * 1000);
  const value = `${expiresAt}.${sign(expiresAt, secret)}`;
  return `${COOKIE_NAME}=${value}; ${cookieAttributes(MAX_AGE_SECONDS)}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

function readCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim();
  }
  return null;
}

export function hasValidSession(request: Request): boolean {
  const secret = signingSecret();
  if (!secret) return false;
  const value = readCookie(request);
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot === -1) return false;
  const expiresAt = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^\d{1,16}$/.test(expiresAt) || !signature) return false;
  if (Number(expiresAt) <= Date.now()) return false;
  return safeEqual(signature, sign(expiresAt, secret));
}

/** A write is allowed for a logged-in browser or for the collector's bearer key. */
export function canWrite(request: Request): boolean {
  return hasValidSession(request) || isMachineAuthorized(request);
}
