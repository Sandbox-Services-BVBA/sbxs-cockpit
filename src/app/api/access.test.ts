/// <reference types="vite/client" />
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Call real handlers without Proxy: an accidental routing bypass must not
// expose data or operate controls. Every new API is included automatically.
const routes = import.meta.glob<Record<string, unknown>>("./**/route.ts");
const protectedRoutes = Object.entries(routes).filter(([path]) => !path.startsWith("./auth/"));
let dir: string;
let session: typeof import("@/lib/session");
let proxyModule: typeof import("@/proxy");

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cockpit-access-"));
  process.env.COCKPIT_DB_PATH = join(dir, "test.db");
  process.env.COCKPIT_API_KEY = "collector-test-key";
  process.env.COCKPIT_PASSWORD = "browser-test-password";
  session = await import("@/lib/session");
  proxyModule = await import("@/proxy");
});
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe("API access independently of Proxy", () => {
  it.each(protectedRoutes)("%s refuses anonymous and invalid credentials before reading data", async (path, load) => {
    const route = await load();
    const url = `https://cockpit.test/api/${path.slice(2, -"/route.ts".length)}`;
    for (const [method, handler] of Object.entries(route)) {
      if (!/^(GET|POST|PUT|DELETE|PATCH)$/.test(method)) continue;
      const credentials: Record<string, string>[] = [{}, { authorization: "Bearer invalid", cookie: "cockpit_session=9999999999999.invalid" }];
      for (const headers of credentials) {
        const request = new NextRequest(url, { method, headers });
        const response = await (handler as (request: NextRequest) => Promise<Response>)(request);
        expect(response.status, `${method} ${url}`).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
      }
    }
  });

  it("lets the collector through both Proxy and ingestion while refusing a browser session there", async () => {
    const route = await import("./status/route");
    const request = new NextRequest("https://cockpit.test/api/status", {
      method: "POST", headers: { authorization: "Bearer collector-test-key", "content-type": "application/json" }, body: "{}",
    });
    expect(proxyModule.proxy(request).headers.get("x-middleware-next")).toBe("1");
    expect((await route.POST(request)).status).toBe(200);
    const browser = new NextRequest(request.url, { method: "POST", headers: { cookie: session.issueSessionCookie().split(";")[0] }, body: "{}" });
    expect((await route.POST(browser)).status).toBe(401);
  });

  it("lets a logged-in browser read the layout and dashboard", async () => {
    const headers = { cookie: session.issueSessionCookie().split(";")[0] };
    const layout = await import("./layout/route");
    const dashboard = await import("./dashboard/route");
    expect((await layout.GET(new Request("https://cockpit.test/api/layout", { headers }))).status).toBe(200);
    expect((await dashboard.GET(new Request("https://cockpit.test/api/dashboard", { headers }))).status).toBe(200);
  });
});
