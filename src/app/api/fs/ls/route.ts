import { unauthorizedResponse } from "@/lib/api-auth";
import { canAccess } from "@/lib/session";
import { NextRequest } from "next/server";
import { fsGate, proxyFs } from "@/lib/devserver-fs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!canAccess(req)) return unauthorizedResponse();

  const denied = fsGate(req);
  if (denied) return denied;
  const path = new URL(req.url).searchParams.get("path") || "";
  return proxyFs("ls", path);
}
