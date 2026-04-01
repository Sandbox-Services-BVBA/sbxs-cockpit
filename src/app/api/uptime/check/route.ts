import { NextRequest } from "next/server";
import { runUptimeChecks } from "@/lib/uptime";
import { processAlertNotifications } from "@/lib/alerts";
import { config } from "@/lib/config";

// Called by cron every 5 minutes
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${config.apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runUptimeChecks();
  await processAlertNotifications();

  return Response.json({ ok: true, checked: results.length, results });
}

// Allow GET for manual trigger during development
export async function GET() {
  const results = await runUptimeChecks();
  await processAlertNotifications();

  return Response.json({ ok: true, checked: results.length, results });
}
