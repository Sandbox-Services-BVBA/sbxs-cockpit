import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Well-day checkmarks — authenticated proxy to energy-monitor on the dev
// server, same bridge as /api/energy. The pump feeds the toilets from the
// water well; Bob checks off the days it ran so city-water usage can be
// compared between well-days and city-days.
//   GET  /api/energy/well                      -> { days: ["YYYY-MM-DD", ...] }
//   POST /api/energy/well { d, well }          -> check/uncheck a day
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
