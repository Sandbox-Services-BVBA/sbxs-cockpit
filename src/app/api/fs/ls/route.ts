import { NextRequest } from "next/server";
import { fsGate, proxyFs } from "@/lib/devserver-fs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = fsGate(req);
  if (denied) return denied;
  const path = new URL(req.url).searchParams.get("path") || "";
  return proxyFs("ls", path);
}
