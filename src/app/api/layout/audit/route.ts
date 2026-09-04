import { readLayoutAudit } from "@/lib/audit";
import { unauthorizedResponse } from "@/lib/api-auth";
import { canWrite } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/layout/audit?limit=N -> { entries: [...] }, newest first.
//
// The read path for layout_audit_log, so a surprising dashboard can be traced
// to a save or reset without opening the database by hand. Gated the same
// way as the writes it records: a logged-in browser or the collector's bearer
// key. The rows name actors and revisions, which is nothing an anonymous
// visitor needs. No UI reads this; curl or the browser console is the client.

const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  if (!canWrite(request)) return unauthorizedResponse();
  const raw = new URL(request.url).searchParams.get("limit");
  const parsed = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return Response.json({ error: "limit must be a positive integer" }, { status: 400 });
  }
  // readLayoutAudit caps at 500 rows.
  return Response.json({ entries: readLayoutAudit(parsed) }, { headers: { "Cache-Control": "no-store" } });
}
