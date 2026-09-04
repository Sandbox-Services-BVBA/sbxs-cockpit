import { getDb } from "@/lib/db";
import { EMPTY_PROFILE, LAYOUT_SCHEMA_VERSION, type LayoutProfile } from "@/lib/layout/types";

// Server-only persistence for the single layout profile. There is one row,
// id "default", because the plan explicitly defers named profiles. The
// revision column is the optimistic lock: a writer must present the revision
// it read, and loses if another device saved in between.
//
// config_json never contains the revision. The column is the only source of
// truth for it, so a client cannot smuggle a revision in through the body.

const PROFILE_ID = "default";
const PROFILE_NAME = "Default";

interface ProfileRow {
  schema_version: number;
  revision: number;
  config_json: string;
}

export type WriteResult =
  | { ok: true; profile: LayoutProfile }
  | { ok: false; conflict: true; profile: LayoutProfile };

function selectRow(): ProfileRow | undefined {
  return getDb()
    .prepare("SELECT schema_version, revision, config_json FROM dashboard_layout_profiles WHERE id = ?")
    .get(PROFILE_ID) as ProfileRow | undefined;
}

function stripRevision(profile: LayoutProfile): Omit<LayoutProfile, "revision"> {
  const { revision: _revision, ...rest } = profile;
  void _revision;
  return rest;
}

/** Never throws. A missing or corrupt row reads as code defaults. */
export function readProfile(): LayoutProfile {
  let row: ProfileRow | undefined;
  try {
    row = selectRow();
  } catch (error) {
    console.error("[layout] read failed, using defaults:", error instanceof Error ? error.message : error);
    return EMPTY_PROFILE;
  }
  if (!row) return EMPTY_PROFILE;
  try {
    const parsed = JSON.parse(row.config_json) as Partial<LayoutProfile>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return {
      ...parsed,
      schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : row.schema_version,
      revision: row.revision,
    };
  } catch (error) {
    // Keep the stored revision so the next honest save can overwrite the
    // corrupt row instead of conflicting forever against a revision it cannot see.
    console.error("[layout] stored profile is unreadable, using defaults:", error instanceof Error ? error.message : error);
    return { ...EMPTY_PROFILE, revision: row.revision };
  }
}

function upsert(profile: Omit<LayoutProfile, "revision">, revision: number): void {
  getDb()
    .prepare(
      `INSERT INTO dashboard_layout_profiles (id, name, schema_version, revision, config_json, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         schema_version = excluded.schema_version,
         revision = excluded.revision,
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    )
    .run(PROFILE_ID, PROFILE_NAME, profile.schemaVersion, revision, JSON.stringify(profile));
}

/**
 * Atomic compare-and-set. Writes only when the stored revision still equals
 * `expectedRevision`; otherwise returns the current profile so the caller can
 * reload rather than clobber another device's save.
 */
export function writeProfile(next: LayoutProfile, expectedRevision: number): WriteResult {
  const db = getDb();
  const run = db.transaction((): WriteResult => {
    const current = selectRow()?.revision ?? 0;
    if (current !== expectedRevision) {
      return { ok: false, conflict: true, profile: readProfile() };
    }
    const revision = current + 1;
    const body = stripRevision(next);
    upsert(body, revision);
    return { ok: true, profile: { ...body, revision } };
  });
  return run();
}

/**
 * Back to code defaults. The row is replaced by an empty override set rather
 * than deleted outright so the revision keeps climbing: a device still holding
 * the pre-reset revision gets a 409 and reloads instead of re-applying its
 * stale overrides on top of the reset.
 */
export function resetProfile(): LayoutProfile {
  const db = getDb();
  const run = db.transaction((): LayoutProfile => {
    const current = selectRow()?.revision ?? 0;
    const revision = current + 1;
    const body = { schemaVersion: LAYOUT_SCHEMA_VERSION };
    upsert(body, revision);
    return { ...body, revision };
  });
  return run();
}
