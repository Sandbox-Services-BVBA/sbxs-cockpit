import { NextRequest } from "next/server";
import { processAlertNotifications } from "@/lib/alerts";
import { config } from "@/lib/config";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${config.apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await processAlertNotifications();
  return Response.json({ ok: true });
}
