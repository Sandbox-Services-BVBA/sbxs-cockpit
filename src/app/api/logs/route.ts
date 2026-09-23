import { unauthorizedResponse } from "@/lib/api-auth";
import { canAccess } from "@/lib/session";
import { NextRequest } from "next/server";
import { fsGate } from "@/lib/devserver-fs";
import { proxyLogs } from "@/lib/devserver-logs";

export const dynamic = "force-dynamic";

// GET /api/logs?source=<id>&lines=N&q=<filter>&level=<error|warn|info>
// Tails one enumerated log source on the dev server. `source` is an opaque id
// validated against the daemon's catalog; no path ever crosses this boundary.
export async function GET(req: NextRequest) {
  if (!canAccess(req)) return unauthorizedResponse();

  const denied = fsGate(req);
  if (denied) return denied;
  return proxyLogs("tail", new URL(req.url).searchParams);
}
