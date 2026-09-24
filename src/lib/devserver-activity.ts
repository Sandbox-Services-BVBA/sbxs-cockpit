import { config } from "./config";

// Proxy to the dev-server file-watcher's activity-log endpoints over Tailscale
// (server-to-server, same COCKPIT_API_KEY secret as the fs/logs endpoints).
// The activity log carries curated one-line summaries of what the automated
// services did (no raw log bodies, no secrets by contract — see
// ~/services/activity-log/CLAUDE.md on the dev server), so unlike the raw log
// endpoints it sits behind the normal dashboard session only.

const ALLOWED_PARAMS = ["service", "severity", "since", "before", "limit"] as const;

export async function proxyActivity(
  endpoint: "feed" | "services",
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
  const path = endpoint === "services" ? "/activity/services" : "/activity";
  const url = `${config.devserverFsUrl}${path}${qs ? `?${qs}` : ""}`;

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}`, "User-Agent": "cockpit/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
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
