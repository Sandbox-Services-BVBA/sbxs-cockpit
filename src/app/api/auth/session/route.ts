import { hasValidSession, isAuthConfigured } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/session -> { authenticated, configured }
// `configured: false` lets the UI say "set COCKPIT_PASSWORD" instead of
// showing a login form that can never succeed. Nothing else is exposed.
export async function GET(request: Request) {
  return Response.json(
    { authenticated: hasValidSession(request), configured: isAuthConfigured() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
