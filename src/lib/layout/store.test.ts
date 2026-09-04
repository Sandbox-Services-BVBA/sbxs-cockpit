import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EMPTY_PROFILE, type LayoutProfile } from "@/lib/layout/types";

// The store opens the shared db singleton lazily, so pointing COCKPIT_DB_PATH
// at a temp file before the first import keeps these tests off cockpit.db.
let dir: string;
let store: typeof import("@/lib/layout/store");
let audit: typeof import("@/lib/audit");

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-layout-"));
  process.env.COCKPIT_DB_PATH = path.join(dir, "test.db");
  store = await import("@/lib/layout/store");
  audit = await import("@/lib/audit");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const SAVED: LayoutProfile = {
  schemaVersion: 1,
  revision: 0,
  views: { sites: { order: ["sites.uptime"], modules: { "sites.uptime": { width: "wide" } } } },
};

describe("layout store", () => {
  it("reads code defaults when nothing is stored", () => {
    expect(store.readProfile()).toEqual(EMPTY_PROFILE);
  });

  it("writes when the expected revision matches and bumps it", () => {
    const result = store.writeProfile(SAVED, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.revision).toBe(1);
      expect(result.profile.views).toEqual(SAVED.views);
    }
    expect(store.readProfile()).toEqual({ ...SAVED, revision: 1 });
  });

  it("returns the current profile on a stale revision without writing", () => {
    const stale = store.writeProfile({ schemaVersion: 1, revision: 0, domains: { personal: { visible: false } } }, 0);
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.conflict).toBe(true);
      expect(stale.profile).toEqual({ ...SAVED, revision: 1 });
    }
    expect(store.readProfile().domains).toBeUndefined();
  });

  it("ignores a revision smuggled in through the body", () => {
    const result = store.writeProfile({ ...SAVED, revision: 40 }, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.revision).toBe(2);
  });

  it("resets to defaults and keeps the revision climbing", () => {
    const reset = store.resetProfile();
    expect(reset.revision).toBe(3);
    expect(reset.views).toBeUndefined();
    expect(store.readProfile()).toEqual({ schemaVersion: 1, revision: 3 });
    // A device still holding revision 2 must lose.
    const late = store.writeProfile(SAVED, 2);
    expect(late.ok).toBe(false);
  });

  it("falls back to defaults on unreadable JSON but keeps the revision", async () => {
    const { getDb } = await import("@/lib/db");
    getDb().prepare("UPDATE dashboard_layout_profiles SET config_json = ? WHERE id = 'default'").run("{not json");
    expect(store.readProfile()).toEqual({ ...EMPTY_PROFILE, revision: 3 });
    // And the next honest save recovers the row.
    const recovered = store.writeProfile(SAVED, 3);
    expect(recovered.ok).toBe(true);
    if (recovered.ok) expect(recovered.profile.revision).toBe(4);
  });
});

describe("layout audit", () => {
  it("records and reads rows newest first", () => {
    audit.recordLayoutAudit("save", "session", 4, "views=1");
    audit.recordLayoutAudit("reset", "api-key", 5, null);
    const rows = audit.readLayoutAudit(10);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ action: "reset", actor: "api-key", revision: 5, summary: null });
    expect(rows[1]).toMatchObject({ action: "save", actor: "session", revision: 4, summary: "views=1" });
  });
});
