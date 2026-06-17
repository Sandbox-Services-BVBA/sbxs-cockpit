import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Thin authenticated proxy to energy-monitor on the dev server (Tailscale).
// The service polls grid (P1) + solar (SMA) + Marstek batteries on the LAN.
// Cockpit runs in the cloud and cannot reach the LAN directly — hence the bridge.
//   GET /api/energy                     -> live snapshot
//   GET /api/energy?raw=1               -> ALL raw live metrics (grouped table)
//   GET /api/energy?start=..&end=..     -> bucketed history for a time range
//   GET /api/energy?hours=6             -> rolling-window history (legacy)
//   GET /api/energy?climate_history=1&hours=24
//                                       -> per-room temp/humidity time-series
//                                          (forwards to /api/climate/history)

const BASE = config.energyBridgeUrl;
const KEY = config.energyBridgeKey;

export async function GET(request: Request) {
  if (!KEY) return Response.json({ error: "energy monitor not configured" }, { status: 503 });
  const sp = new URL(request.url).searchParams;
  let path = "/api/live";
  if (sp.get("climate_history")) {
    const hours = sp.get("hours") || "24";
    path = `/api/climate/history?hours=${encodeURIComponent(hours)}`;
  } else if (sp.get("raw")) {
    path = "/api/raw";
  } else if (sp.get("start") && sp.get("end")) {
    path = `/api/history?start=${encodeURIComponent(sp.get("start")!)}&end=${encodeURIComponent(sp.get("end")!)}`;
  } else if (sp.get("hours")) {
    path = `/api/history?hours=${encodeURIComponent(sp.get("hours")!)}`;
  }
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
