import { NextRequest } from "next/server";
import { processAlertNotifications } from "@/lib/alerts";
import { isMachineAuthorized, unauthorizedResponse } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  if (!isMachineAuthorized(request)) return unauthorizedResponse();

  await processAlertNotifications();
  return Response.json({ ok: true });
}
