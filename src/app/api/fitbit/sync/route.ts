import { NextRequest } from "next/server";
import { syncWeightDelta, isConnected } from "@/lib/fitbit";
import { isMachineAuthorized, unauthorizedResponse } from "@/lib/api-auth";

// Called by cron daily -- only syncs last 7 days (delta)
export async function POST(request: NextRequest) {
  if (!isMachineAuthorized(request)) return unauthorizedResponse();

  if (!isConnected()) {
    return Response.json({ error: "Fitbit not connected. Visit /api/fitbit/auth first." }, { status: 400 });
  }

  try {
    const result = await syncWeightDelta();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: "Use authenticated POST" }, { status: 405 });
}
