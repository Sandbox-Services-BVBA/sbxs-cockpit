import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Thin authenticated proxy to energy-monitor on the dev server (Tailscale).
// The service polls grid (P1) + solar (SMA) + Marstek batteries on the LAN.
// Cockpit runs in the cloud and cannot reach the LAN directly — hence the bridge.
//   GET /api/energy            -> live snapshot
//   GET /api/energy?hours=6    -> bucketed history for charts

const BASE = config.energyBridgeUrl;
const KEY = config.energyBridgeKey;

export async function GET(request: Request) {
  if (!KEY) return Response.json({ error: "energy monitor not configured" }, { status: 503 });
  const hours = new URL(request.url).searchParams.get("hours");
  const path = hours ? `/api/history?hours=${encodeURIComponent(hours)}` : "/api/live";
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    const body = await res.json();
    return Response.json(body, { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}
