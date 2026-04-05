import { NextRequest } from "next/server";
import { syncWeightData, isConnected } from "@/lib/fitbit";
import { config } from "@/lib/config";

// Called by cron to sync weight data
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${config.apiKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConnected()) {
    return Response.json({ error: "Fitbit not connected. Visit /api/fitbit/auth first." }, { status: 400 });
  }

  try {
    const result = await syncWeightData();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}

// GET for manual trigger
export async function GET() {
  if (!isConnected()) {
    return Response.json({ connected: false, message: "Visit /api/fitbit/auth to connect" });
  }

  try {
    const result = await syncWeightData();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
