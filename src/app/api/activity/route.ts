import { unauthorizedResponse } from "@/lib/api-auth";
import { canAccess } from "@/lib/session";
import { NextRequest } from "next/server";
import { proxyActivity } from "@/lib/devserver-activity";

export const dynamic = "force-dynamic";

// GET /api/activity?service=&severity=&since=&before=&limit=
// The activity feed: what the automated services/bots did, newest first.
export async function GET(req: NextRequest) {
  if (!canAccess(req)) return unauthorizedResponse();
  return proxyActivity("feed", new URL(req.url).searchParams);
}
