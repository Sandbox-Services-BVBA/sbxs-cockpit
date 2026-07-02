import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Well-pump log — authenticated proxy to energy-monitor on the dev server,
// same bridge as /api/energy. The pump feeds the toilets from the water well;
// Bob toggles it by hand and logs each toggle here so city-water usage can be
// compared between well-days and city-days.
//   GET  /api/energy/well                    -> { running, since, events }
//   POST /api/energy/well { running, ts? }   -> log a toggle (ts = unix,
//                                               optional, for backdating)
// No auth on the cockpit side — dashboard is Tailscale-only, same as the
// sobriety and home-control routes.

const BASE = config.energyBridgeUrl;
const KEY = config.energyBridgeKey;

export async function GET() {
  if (!KEY) return Response.json({ error: "energy monitor not configured" }, { status: 503 });
  try {
    const res = await fetch(`${BASE}/api/well`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    return Response.json(await res.json(), { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!KEY) return Response.json({ error: "energy monitor not configured" }, { status: 503 });
  try {
    const body = await request.text();
    const res = await fetch(`${BASE}/api/well`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    return Response.json(await res.json(), { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}
