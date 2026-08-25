import { config } from "./config";

// Proxy to the dev-server file-watcher's log endpoints over Tailscale
// (server-to-server, same COCKPIT_API_KEY secret as the fs endpoints).
// Browser access is gated separately by `fsGate` in devserver-fs.ts: log bodies
// carry message content, client data and tokens in stack traces, so they sit
// behind the same fail-closed key as file contents.

const ALLOWED_PARAMS = ["source", "lines", "q", "level"] as const;

export async function proxyLogs(
  endpoint: "sources" | "tail",
  params?: URLSearchParams
): Promise<Response> {
  const search = new URLSearchParams();
  if (params) {
    for (const key of ALLOWED_PARAMS) {
      const value = params.get(key);
      if (value) search.set(key, value);
    }
  }
  const qs = search.toString();
  const url = `${config.devserverFsUrl}/logs/${endpoint}${qs ? `?${qs}` : ""}`;

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}`, "User-Agent": "cockpit/1.0" },
      cache: "no-store",
      // The daemon may shell out to journalctl/pm2, so allow more than the fs
      // endpoints get, but still bound it.
      signal: AbortSignal.timeout(30000),
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json({ error: "Dev server unreachable" }, { status: 502 });
  }
}
