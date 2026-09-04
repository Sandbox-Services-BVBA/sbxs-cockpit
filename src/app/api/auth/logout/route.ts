import { clearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/logout -> clears the session cookie. Stateless sessions have
// nothing to revoke server-side; dropping the cookie is the whole logout.
export async function POST() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
}
