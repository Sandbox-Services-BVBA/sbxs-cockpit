import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";
import { issueSessionCookie } from "@/lib/session";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://cockpit.test${path}`, { headers });
}

beforeEach(() => {
  vi.stubEnv("COCKPIT_PASSWORD", "test-password");
  vi.stubEnv("COCKPIT_SESSION_SECRET", "test-signing-secret");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("dashboard access", () => {
  it.each(["/", "/wall", "/kitchen", "/infra/logs", "/energy", "/private.json", "/_next/data/build/index.json"])("gates anonymous page %s", (path) => {
    expect(unstable_doesProxyMatch({ config, url: `https://cockpit.test${path}` })).toBe(true);
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("preserves a deep link and its query", () => {
    const response = proxy(request("/infra/logs?source=pm2"));
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/infra/logs?source=pm2");
  });

  it.each(["/api/dashboard", "/api/health", "/api/health/sobriety", "/api/bank", "/api/tmux", "/api/layout", "/api/status", "/api/home", "/api/fitbit/callback", "/api/new-endpoint.json"])("rejects anonymous API %s", async (path) => {
    const response = proxy(request(path));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not trust prefetch, RSC or middleware bypass headers", () => {
    const response = proxy(request("/api/dashboard", {
      RSC: "1", "next-router-prefetch": "1", "x-middleware-subrequest": "src/proxy:src/proxy:src/proxy:src/proxy:src/proxy",
    }));
    expect(response.status).toBe(401);
  });

  it.each(["/api/auth/login", "/api/auth/logout", "/api/auth/session", "/login", "/manifest.json", "/icon.svg"])("keeps login and app assets reachable: %s", (path) => {
    expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
  });

  it("excludes only framework static assets from the matcher", () => {
    expect(unstable_doesProxyMatch({ config, url: "https://cockpit.test/_next/static/chunks/app.js" })).toBe(false);
    expect(unstable_doesProxyMatch({ config, url: "https://cockpit.test/_next/image?url=/api/dashboard" })).toBe(true);
  });

  it("accepts a valid session and marks responses private", () => {
    const cookie = issueSessionCookie().split(";")[0];
    for (const path of ["/", "/wall", "/kitchen", "/api/dashboard", "/api/layout"]) {
      const response = proxy(request(path, { cookie }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("redirects an already logged-in browser from login to its safe destination", () => {
    const cookie = issueSessionCookie().split(";")[0];
    expect(proxy(request("/login?next=%2Fwall", { cookie })).headers.get("location")).toBe("https://cockpit.test/wall");
    expect(proxy(request("/login?next=https://evil.test", { cookie })).headers.get("location")).toBe("https://cockpit.test/");
  });

  it("refuses forged and expired cookies", () => {
    expect(proxy(request("/api/dashboard", { cookie: "cockpit_session=9999999999999.forged" })).status).toBe(401);
    vi.useFakeTimers();
    const cookie = issueSessionCookie().split(";")[0];
    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000 + 1);
    expect(proxy(request("/api/dashboard", { cookie })).status).toBe(401);
  });

  it("fails closed without a password even if a signing secret is configured", () => {
    const cookie = issueSessionCookie().split(";")[0];
    vi.stubEnv("COCKPIT_PASSWORD", "");
    expect(proxy(request("/api/dashboard", { cookie })).status).toBe(401);
    expect(() => issueSessionCookie()).toThrow("not configured");
  });
});
