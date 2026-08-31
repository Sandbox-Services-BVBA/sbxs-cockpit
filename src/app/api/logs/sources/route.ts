import { NextRequest } from "next/server";
import { fsGate } from "@/lib/devserver-fs";
import { proxyLogs } from "@/lib/devserver-logs";

export const dynamic = "force-dynamic";

// GET /api/logs/sources — every log the dev server can reach (pm2 apps, systemd
// user units, named project files, service-local log dirs) with size, mtime,
// live flag and a bounded 24h error count.
export async function GET(req: NextRequest) {
  const denied = fsGate(req);
  if (denied) return denied;
  return proxyLogs("sources");
}
