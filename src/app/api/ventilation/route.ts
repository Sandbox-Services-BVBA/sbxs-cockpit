import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Thin authenticated proxy to ventilation-monitor on the dev server (Tailscale).
// The service polls + controls the Ubbink Ubiflux Vigor MVHR over Modbus on the LAN.
// Cockpit runs in the cloud and cannot reach the LAN directly — hence the bridge.
//   GET  /api/ventilation                  -> live snapshot
//   GET  /api/ventilation?start=..&end=..  -> bucketed history for a time range
//   POST /api/ventilation { mode }         -> set fan mode (holiday|low|normal|high|wall)

const BASE = config.ventilationBridgeUrl;
const KEY = config.ventilationBridgeKey;

export async function GET(request: Request) {
  if (!KEY) return Response.json({ error: "ventilation monitor not configured" }, { status: 503 });
  const sp = new URL(request.url).searchParams;
  let path = "/api/live";
  if (sp.get("start") && sp.get("end")) {
    path = `/api/history?start=${encodeURIComponent(sp.get("start")!)}&end=${encodeURIComponent(sp.get("end")!)}`;
  } else if (sp.get("hours")) {
    path = `/api/history?hours=${encodeURIComponent(sp.get("hours")!)}`;
  }
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    return Response.json(await res.json(), { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!KEY) return Response.json({ error: "ventilation monitor not configured" }, { status: 503 });
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }
  try {
    const res = await fetch(`${BASE}/api/control`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return Response.json(await res.json(), { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}
