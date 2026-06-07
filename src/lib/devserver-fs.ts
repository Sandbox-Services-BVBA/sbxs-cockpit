import { NextRequest } from "next/server";
import { config } from "./config";

// Gate browser access to the file API. Fail-closed: if no FS_ACCESS_KEY is
// configured, file access is disabled entirely (file contents are more
// sensitive than the dashboard metrics, and cockpit is publicly reachable).
export function fsGate(req: NextRequest): Response | null {
  if (!config.fsAccessKey) {
    return Response.json({ error: "File access not configured (set FS_ACCESS_KEY)" }, { status: 503 });
  }
  if (req.headers.get("x-fs-key") !== config.fsAccessKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// Proxy to the dev-server fs endpoint over Tailscale (server-to-server).
export async function proxyFs(endpoint: "ls" | "cat", path: string): Promise<Response> {
  const url = `${config.devserverFsUrl}/fs/${endpoint}?path=${encodeURIComponent(path)}`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}`, "User-Agent": "cockpit/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
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
