import { NextRequest, NextResponse } from "next/server";
import { canAccess, hasValidSession } from "@/lib/session";
import { safeReturnTo } from "@/lib/login-redirect";

// Explicit public assets only. An extension or an /api prefix must never
// exempt a data endpoint, an RSC request or a future page from authentication.
const PUBLIC_ASSETS = new Set([
  "/manifest.json", "/favicon.ico", "/favicon-32.png", "/icon.svg",
  "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png",
]);
const AUTH_ROUTES = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/session"]);

function privateResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_ASSETS.has(pathname)) return NextResponse.next();

  if (pathname === "/login") {
    if (hasValidSession(request)) {
      return privateResponse(NextResponse.redirect(new URL(safeReturnTo(request.nextUrl.searchParams.get("next")), request.url)));
    }
    return privateResponse(NextResponse.next());
  }
  if (AUTH_ROUTES.has(pathname)) return privateResponse(NextResponse.next());

  const api = pathname === "/api" || pathname.startsWith("/api/");
  // Machine keys retain API access; browser pages always require a session.
  if (api ? canAccess(request) : hasValidSession(request)) {
    return privateResponse(NextResponse.next());
  }
  if (api) {
    return privateResponse(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return privateResponse(NextResponse.redirect(login));
}

export const config = {
  matcher: ["/((?!_next/static/).*)"],
};
