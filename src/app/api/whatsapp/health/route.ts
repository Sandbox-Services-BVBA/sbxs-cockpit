import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// The bridge's own link state, which is a different question from whether the
// bridge process is answering. /api/chats and /api/messages both return calmly
// while whatsapp_linked is false and nothing is being ingested, so the widget
// needs this endpoint to tell the truth about itself.
//
// /health on the bridge is unauthenticated and returns no message content, only
// link state and counts, so this proxy sends no bearer token.

const BASE = config.whatsappBridgeUrl;

export interface BridgeHealth {
  status?: string;
  logged_in?: boolean;
  self?: string;
  whatsapp_linked?: boolean;
  rooms_seen?: number;
  followed_count?: number;
  last_sync_at?: string | null;
  logged_total?: number;
  errors?: number;
}

export async function GET() {
  try {
    const res = await fetch(`${BASE}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as BridgeHealth;
    return Response.json(body, { status: res.status });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "bridge unreachable" },
      { status: 502 }
    );
  }
}
