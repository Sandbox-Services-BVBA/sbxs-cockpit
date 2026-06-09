import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Proxy to the dev-server watcher's /tmux endpoint over Tailscale. Returns the
// list of tmux windows (Claude agents) with last-activity timestamps. Open like
// the rest of the dashboard (session metadata, not file contents).
export async function GET() {
  try {
    const r = await fetch(`${config.devserverFsUrl}/tmux`, {
      headers: { Authorization: `Bearer ${config.apiKey}`, "User-Agent": "cockpit/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json(
      { windows: [], now: Math.floor(Date.now() / 1000), error: "Dev server unreachable" },
      { status: 200 }
    );
  }
}
