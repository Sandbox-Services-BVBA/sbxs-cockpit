import { config } from "./config";

export function isMachineAuthorized(request: Request) {
  if (!config.apiKey) return false;
  return request.headers.get("Authorization") === `Bearer ${config.apiKey}`;
}

export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
