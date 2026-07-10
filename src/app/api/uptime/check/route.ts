import { NextRequest } from "next/server";
import { runUptimeChecks } from "@/lib/uptime";
import { processAlertNotifications } from "@/lib/alerts";
import { isMachineAuthorized, unauthorizedResponse } from "@/lib/api-auth";

// Called by cron every 5 minutes
export async function POST(request: NextRequest) {
  if (!isMachineAuthorized(request)) return unauthorizedResponse();

  const results = await runUptimeChecks();
  await processAlertNotifications();

  return Response.json({ ok: true, checked: results.length, results });
}

export async function GET() {
  return Response.json({ error: "Use authenticated POST" }, { status: 405 });
}
