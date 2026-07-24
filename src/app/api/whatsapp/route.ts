import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Thin authenticated proxy to whatsapp-bridge on the dev server (Tailscale).
// The bridge is linked to Bob's WhatsApp as a read-only companion device and logs
// only the chats explicitly followed here. Cockpit runs in the cloud and cannot
// reach it directly — hence the bridge, same pattern as home-bridge.

const BASE = config.whatsappBridgeUrl;
const KEY = config.whatsappBridgeKey;

function authHeaders() {
  return { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
}

function disabled() {
  return Response.json({ error: "whatsapp bridge not configured" }, { status: 503 });
}

// GET /api/whatsapp            -> chat list (which are followed, counts, last activity)
// GET /api/whatsapp?room_id=…  -> message log for one chat (&limit=N)
// GET /api/whatsapp?feed=1     -> merged log across all followed chats
export async function GET(request: Request) {
  if (!KEY) return disabled();
  const url = new URL(request.url);
  const roomId = url.searchParams.get("room_id");
  const feed = url.searchParams.get("feed");
  const limit = url.searchParams.get("limit") || "50";

  let path = "/api/chats";
  if (roomId) path = `/api/messages?room_id=${encodeURIComponent(roomId)}&limit=${encodeURIComponent(limit)}`;
  else if (feed) path = `/api/messages?limit=${encodeURIComponent(limit)}`;

  try {
    const res = await fetch(`${BASE}${path}`, { headers: authHeaders(), cache: "no-store" });
    const body = await res.json();
    return Response.json(body, { status: res.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "bridge unreachable" }, { status: 502 });
  }
}

// Body: { room_id, name?, enabled } — follow / unfollow a conversation.
export async function POST(request: Request) {
  if (!KEY) return disabled();
  const payload = await request.json();
  if (!payload?.room_id) return Response.json({ error: "room_id required" }, { status: 400 });
  try {
    const res = await fetch(`${BASE}/api/follow`, {
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
