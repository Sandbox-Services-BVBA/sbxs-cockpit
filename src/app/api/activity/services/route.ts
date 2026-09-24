import { unauthorizedResponse } from "@/lib/api-auth";
import { canAccess } from "@/lib/session";
import { NextRequest } from "next/server";
import { proxyActivity } from "@/lib/devserver-activity";

export const dynamic = "force-dynamic";

// GET /api/activity/services — per-service last-seen and 24h counts, for the
// automation health strip on the activity widget.
export async function GET(req: NextRequest) {
  if (!canAccess(req)) return unauthorizedResponse();
  return proxyActivity("services", new URL(req.url).searchParams);
}
