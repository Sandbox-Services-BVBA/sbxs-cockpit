import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Thin authenticated proxy to home-bridge on the dev server (Tailscale).
// The bridge holds the HA token + scene defs and talks to the LAN. Cockpit runs
// in the cloud and cannot reach Home Assistant directly — hence the bridge.

const BASE = config.homeBridgeUrl;
const KEY = config.homeBridgeKey;

function authHeaders() {
  return { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
}

export async function GET() {
  if (!KEY) return Response.json({ error: "home bridge not configured" }, { status: 503 });
  try {
    const res = await fetch(`${BASE}/api/state`, { headers: authHeaders(), cache: "no-store" });
    const body = await res.json();
    return Response.json(body, { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}

// Body: { action: "scene"|"light"|"switch"|"proxmox-rgb", ...payload }
export async function POST(request: Request) {
  if (!KEY) return Response.json({ error: "home bridge not configured" }, { status: 503 });
  const { action, ...payload } = await request.json();
  const routes: Record<string, string> = {
    scene: "/api/scene",
    light: "/api/light",
    switch: "/api/switch",
    "proxmox-rgb": "/api/proxmox-rgb",
  };
  const path = routes[action];
  if (!path) return Response.json({ error: "unknown action" }, { status: 400 });
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return Response.json(body, { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}
