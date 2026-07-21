import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Thin authenticated proxy to home-bridge on the dev server (Tailscale), which
// holds the HA token and reads/controls the Mitsubishi MELCloud Home airco units
// on the LAN. Cockpit runs in the cloud and cannot reach the LAN directly.
//   GET  /api/airco                                  -> { units: [...] }
//   POST /api/airco { id, mode?, targetTemp?, fanMode? } -> control one unit

const BASE = config.homeBridgeUrl;
const KEY = config.homeBridgeKey;

export async function GET() {
  if (!KEY) return Response.json({ error: "home bridge not configured" }, { status: 503 });
  try {
    const res = await fetch(`${BASE}/api/airco`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    return Response.json(await res.json(), { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!KEY) return Response.json({ error: "home bridge not configured" }, { status: 503 });
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }
  try {
    const res = await fetch(`${BASE}/api/airco`, {
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
