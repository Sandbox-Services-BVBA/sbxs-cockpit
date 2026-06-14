import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Proxy for the forecast-driven pre-cool toggle on ventilation-monitor.
//   GET  /api/ventilation/automation        -> automation state
//   POST /api/ventilation/automation {enabled} -> turn the feature on/off

const BASE = config.ventilationBridgeUrl;
const KEY = config.ventilationBridgeKey;

export async function GET() {
  if (!KEY) return Response.json({ error: "ventilation monitor not configured" }, { status: 503 });
  try {
    const res = await fetch(`${BASE}/api/automation`, { headers: { Authorization: `Bearer ${KEY}` }, cache: "no-store" });
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
    /* empty */
  }
  try {
    const res = await fetch(`${BASE}/api/automation`, {
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
