import { getModule } from "@/lib/layout/catalog";
import { CANVAS_COLS, CANVAS_MAX_ROWS } from "@/lib/layout/grid";
import {
  LAYOUT_SCHEMA_VERSION,
  type LayoutProfile,
  type ModuleDensity,
  type ModuleOverride,
  type ModuleWidth,
  type SurfaceId,
  type TileRect,
  type ViewOverride,
} from "@/lib/layout/types";
import { VIEWS } from "@/lib/views";

// Gate between an untrusted PUT body and the database. The rule of thumb:
// a value that merely no longer exists (a renamed module, a view that went
// away) is dropped so an old profile keeps working; a value of the wrong
// shape or one that breaks a policy (privacy, safety, capabilities) rejects
// the whole document, because the client that sent it is confused and
// half-applying its intent would be worse than telling it so.
//
// The result contains overrides only. Defaults are never copied in, so a
// later change to the code defaults reaches every device.

export const MAX_PROFILE_BYTES = 64 * 1024;

export type ValidationResult =
  | { ok: true; profile: LayoutProfile }
  | { ok: false; error: string };

const WIDTHS: ReadonlySet<string> = new Set<ModuleWidth>(["compact", "standard", "wide", "full"]);
const DENSITIES: ReadonlySet<string> = new Set<ModuleDensity>(["summary", "standard", "full"]);
const VIEW_IDS: ReadonlySet<string> = new Set(VIEWS.map((view) => view.id));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function isSurfaceId(value: string): value is SurfaceId {
  return VIEW_IDS.has(value);
}

type RectCheck = { ok: true; rect: TileRect } | { ok: false; error: string };

/**
 * A rectangle from the wire. Unlike an unknown module id, a malformed or
 * out-of-bounds rectangle is not something that merely went away: it is a
 * client that has miscalculated, and storing it would put a tile off the
 * plane or shrink it past legibility with no way back. So this rejects the
 * whole document rather than dropping the field.
 */
function checkRect(raw: unknown, where: string, min: { w: number; h: number }): RectCheck {
  if (!isPlainObject(raw)) return { ok: false, error: `${where}.rect must be an object` };
  const { x, y, w, h } = raw;
  for (const [name, value] of [["x", x], ["y", y], ["w", w], ["h", h]] as const) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return { ok: false, error: `${where}.rect.${name} must be a non-negative integer` };
    }
  }
  const rect = { x, y, w, h } as TileRect;
  if (rect.w < min.w || rect.h < min.h) {
    return { ok: false, error: `${where}.rect is smaller than this module's minimum of ${min.w}x${min.h}` };
  }
  if (rect.x + rect.w > CANVAS_COLS) {
    return { ok: false, error: `${where}.rect runs past the right edge of the plane (${CANVAS_COLS} columns)` };
  }
  if (rect.y + rect.h > CANVAS_MAX_ROWS) {
    return { ok: false, error: `${where}.rect runs past the bottom of the plane (${CANVAS_MAX_ROWS} rows)` };
  }
  return { ok: true, rect };
}

type ModuleCheck = { ok: true; override: ModuleOverride | null } | { ok: false; error: string };

function checkModuleOverride(viewId: SurfaceId, moduleId: string, raw: unknown): ModuleCheck {
  if (!isPlainObject(raw)) return { ok: false, error: `views.${viewId}.modules.${moduleId} must be an object` };

  const definition = getModule(moduleId);
  // Unknown id: drop silently, it is most likely a module that was removed.
  if (!definition) return { ok: true, override: null };
  const where = `views.${viewId}.modules.${moduleId}`;

  // Privacy comes before reach. No private or control module lists the wall
  // in its allowed views, so checking reach first would quietly drop the
  // attempt; a client asking for it is confused and should be told so.
  if (raw.enabled === true && viewId === "wall" && definition.sensitivity !== "normal") {
    return { ok: false, error: `${where}: ${definition.sensitivity} modules may not appear on the wallboard` };
  }
  // A module that may not live in this view: drop silently.
  if (!definition.allowedViews.includes(viewId)) return { ok: true, override: null };

  const override: ModuleOverride = {};

  if (raw.enabled !== undefined) {
    if (typeof raw.enabled !== "boolean") return { ok: false, error: `${where}.enabled must be a boolean` };
    if (raw.enabled === false && definition.required) {
      return { ok: false, error: `${where}: "${definition.title}" is required and cannot be hidden` };
    }
    override.enabled = raw.enabled;
  }

  if (raw.width !== undefined) {
    if (typeof raw.width !== "string" || !WIDTHS.has(raw.width)) {
      return { ok: false, error: `${where}.width must be one of compact, standard, wide, full` };
    }
    if (!definition.allowedWidths.includes(raw.width as ModuleWidth)) {
      return { ok: false, error: `${where}.width "${raw.width}" is not supported by this module` };
    }
    override.width = raw.width as ModuleWidth;
  }

  if (raw.rect !== undefined) {
    // Rectangles are the canvas's arrangement. The wallboard flows, so a
    // rectangle aimed at it is stale weight from a confused client rather
    // than a policy breach: drop it and keep the rest.
    if (viewId !== "canvas") {
      // fall through without recording it
    } else {
      const rect = checkRect(raw.rect, where, definition.minSize);
      if (!rect.ok) return { ok: false, error: rect.error };
      override.rect = rect.rect;
    }
  }

  if (raw.density !== undefined) {
    if (typeof raw.density !== "string" || !DENSITIES.has(raw.density)) {
      return { ok: false, error: `${where}.density must be one of summary, standard, full` };
    }
    if (!definition.allowedDensities.includes(raw.density as ModuleDensity)) {
      return { ok: false, error: `${where}.density "${raw.density}" is not supported by this module` };
    }
    override.density = raw.density as ModuleDensity;
  }

  return { ok: true, override: Object.keys(override).length > 0 ? override : null };
}

type ViewCheck = { ok: true; override: ViewOverride | null } | { ok: false; error: string };

function checkViewOverride(viewId: SurfaceId, raw: unknown): ViewCheck {
  if (!isPlainObject(raw)) return { ok: false, error: `views.${viewId} must be an object` };
  const override: ViewOverride = {};

  if (raw.order !== undefined) {
    if (!Array.isArray(raw.order) || raw.order.some((id) => typeof id !== "string")) {
      return { ok: false, error: `views.${viewId}.order must be an array of module ids` };
    }
    const seen = new Set<string>();
    const order: string[] = [];
    for (const id of raw.order as string[]) {
      if (seen.has(id)) continue;
      const definition = getModule(id);
      if (!definition || !definition.allowedViews.includes(viewId)) continue;
      seen.add(id);
      order.push(id);
    }
    if (order.length > 0) override.order = order;
  }

  if (raw.modules !== undefined) {
    if (!isPlainObject(raw.modules)) return { ok: false, error: `views.${viewId}.modules must be an object` };
    const modules: Record<string, ModuleOverride> = {};
    for (const [moduleId, value] of Object.entries(raw.modules)) {
      const checked = checkModuleOverride(viewId, moduleId, value);
      if (!checked.ok) return checked;
      if (checked.override) modules[moduleId] = checked.override;
    }
    if (Object.keys(modules).length > 0) override.modules = modules;
  }

  return { ok: true, override: Object.keys(override).length > 0 ? override : null };
}

export function validateProfile(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) return fail("profile must be an object");

  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return fail("profile is not serializable");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_PROFILE_BYTES) {
    return fail(`profile exceeds ${MAX_PROFILE_BYTES / 1024} KB`);
  }

  const { schemaVersion, revision } = raw;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return fail("schemaVersion must be a positive integer");
  }
  if (schemaVersion > LAYOUT_SCHEMA_VERSION) {
    return fail(`schemaVersion ${schemaVersion} is newer than this server supports (${LAYOUT_SCHEMA_VERSION})`);
  }
  if (revision !== undefined && (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0)) {
    return fail("revision must be a non-negative integer");
  }

  const profile: LayoutProfile = { schemaVersion, revision: typeof revision === "number" ? revision : 0 };


  if (raw.views !== undefined) {
    if (!isPlainObject(raw.views)) return fail("views must be an object");
    const views: Partial<Record<SurfaceId, ViewOverride>> = {};
    for (const [key, value] of Object.entries(raw.views)) {
      if (!isSurfaceId(key)) continue;
      const checked = checkViewOverride(key, value);
      if (!checked.ok) return fail(checked.error);
      if (checked.override) views[key] = checked.override;
    }
    if (Object.keys(views).length > 0) profile.views = views;
  }

  return { ok: true, profile };
}
