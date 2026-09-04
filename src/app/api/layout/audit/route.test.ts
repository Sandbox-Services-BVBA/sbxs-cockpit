import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The route reaches the shared db singleton and the env-backed api key, so
// both are pointed at test values before the first import.
let dir: string;
let route: typeof import("./route");
let audit: typeof import("@/lib/audit");

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-audit-"));
  process.env.COCKPIT_DB_PATH = path.join(dir, "test.db");
  process.env.COCKPIT_API_KEY = "test-key";
  delete process.env.COCKPIT_PASSWORD;
  route = await import("./route");
  audit = await import("@/lib/audit");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function get(query = "", headers: Record<string, string> = {}) {
  return route.GET(new Request(`http://cockpit.test/api/layout/audit${query}`, { headers }));
}

const AUTH = { Authorization: "Bearer test-key" };

describe("GET /api/layout/audit", () => {
  it("rejects an anonymous reader", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("", { Authorization: "Bearer wrong" })).status).toBe(401);
  });

  it("returns the newest entries first for the collector key", async () => {
    audit.recordLayoutAudit("save", "session", 1, "views=1");
    audit.recordLayoutAudit("reset", "api-key", 2, null);
    const response = await get("", AUTH);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entries: { action: string; revision: number }[] };
    expect(body.entries.map((e) => e.action)).toEqual(["reset", "save"]);
    expect(body.entries[0].revision).toBe(2);
  });

  it("honours a limit and refuses a bad one", async () => {
    const one = (await (await get("?limit=1", AUTH)).json()) as { entries: unknown[] };
    expect(one.entries).toHaveLength(1);
    expect((await get("?limit=0", AUTH)).status).toBe(400);
    expect((await get("?limit=abc", AUTH)).status).toBe(400);
  });
});
