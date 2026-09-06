// The pure layout resolver: catalog defaults plus a saved profile in, the
// effective layout out. No React, no IO, nothing that cannot run in a test.
//
// The profile is treated as untrusted input from an older version of the
// app, another device, or a hand-edited row: every id, enum and shape is
// checked against the catalog, and anything that does not fit is dropped
// rather than thrown. Unknown module ids never reach the output.

import { VIEW_BY_ID } from "@/lib/views";
import { MODULE_BY_ID } from "./catalog";
import { CANVAS_DEFAULT_RECTS, DEFAULT_LAYOUTS } from "./default-layouts";
import { CANVAS_COLS, CANVAS_MAX_ROWS } from "./grid";
import {
  EMPTY_PROFILE,
  LAYOUT_SCHEMA_VERSION,
  type LayoutProfile,
  type ModuleDensity,
  type ModuleOverride,
  type ModuleWidth,
  type ResolvedModule,
  type ResolvedView,
  type SurfaceId,
  type TileRect,
  type ViewOverride,
} from "./types";

const WIDTHS: ModuleWidth[] = ["compact", "standard", "wide", "full"];
const DENSITIES: ModuleDensity[] = ["summary", "standard", "full"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSurfaceId(value: string): value is SurfaceId {
  return Object.prototype.hasOwnProperty.call(VIEW_BY_ID, value);
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalEnum<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : undefined;
}

function isCell(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * A rectangle is all four numbers or nothing. Half a rectangle is not a
 * smaller preference, it is a corrupt one, so a partial or out-of-bounds
 * value drops the whole thing and the tile falls back to its default slot.
 */
function normalizeRect(raw: unknown): TileRect | undefined {
  if (!isRecord(raw)) return undefined;
  const { x, y, w, h } = raw;
  if (!isCell(x) || !isCell(y) || !isCell(w) || !isCell(h)) return undefined;
  if (w < 1 || h < 1) return undefined;
  if (x + w > CANVAS_COLS) return undefined;
  if (y + h > CANVAS_MAX_ROWS) return undefined;
  return { x, y, w, h };
}

function normalizeModuleOverride(raw: unknown): ModuleOverride | undefined {
  if (!isRecord(raw)) return undefined;
  const override: ModuleOverride = {};
  const enabled = optionalBoolean(raw.enabled);
  const width = optionalEnum(raw.width, WIDTHS);
  const density = optionalEnum(raw.density, DENSITIES);
  const rect = normalizeRect(raw.rect);
  if (enabled !== undefined) override.enabled = enabled;
  if (width) override.width = width;
  if (density) override.density = density;
  if (rect) override.rect = rect;
  return override;
}

function normalizeViewOverride(raw: unknown): ViewOverride | undefined {
  if (!isRecord(raw)) return undefined;
  const view: ViewOverride = {};
  if (Array.isArray(raw.order)) {
    view.order = raw.order.filter((id): id is string => typeof id === "string");
  }
  if (isRecord(raw.modules)) {
    const modules: Record<string, ModuleOverride> = {};
    for (const [id, value] of Object.entries(raw.modules)) {
      const override = normalizeModuleOverride(value);
      if (override) modules[id] = override;
    }
    view.modules = modules;
  }
  return view;
}

/**
 * Coerce whatever came off the wire or out of the database into a profile
 * the resolver can trust. Inside a good profile, malformed fields are
 * dropped one by one so a single bad value does not cost Bob the rest of
 * his layout.
 *
 * An older schema is read, not discarded. Version 2 added canvas rectangles
 * and changed nothing else, so every field a version 1 profile carries
 * still means what it meant: a tile Bob closed months ago stays closed, and
 * simply has no saved rectangle until he drags it. A version from the
 * future is a different matter, because we cannot know what its fields
 * mean, so that resolves to the defaults.
 */
export function normalizeProfile(raw: unknown): LayoutProfile {
  const version = isRecord(raw) ? raw.schemaVersion : undefined;
  if (
    !isRecord(raw) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > LAYOUT_SCHEMA_VERSION
  ) {
    return { ...EMPTY_PROFILE };
  }
  const profile: LayoutProfile = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    revision:
      typeof raw.revision === "number" && Number.isInteger(raw.revision) && raw.revision >= 0
        ? raw.revision
        : 0,
  };
  if (isRecord(raw.views)) {
    const views: LayoutProfile["views"] = {};
    for (const [id, value] of Object.entries(raw.views)) {
      if (!isSurfaceId(id)) continue;
      const view = normalizeViewOverride(value);
      if (view) views[id] = view;
    }
    profile.views = views;
  }
  return profile;
}

/**
 * A saved rectangle is honoured, but never below the size at which the
 * module stops being readable: a profile written before a module raised its
 * floor would otherwise leave a permanently unusable tile with no way back.
 */
function clampRect(rect: TileRect, min: { w: number; h: number }): TileRect {
  const w = Math.min(Math.max(rect.w, min.w), CANVAS_COLS);
  const h = Math.max(rect.h, min.h);
  const x = Math.min(rect.x, CANVAS_COLS - w);
  return { x, y: rect.y, w, h };
}

/** The wall is a shared screen: private data and write controls stay off it. */
function allowedOnView(viewId: SurfaceId, moduleId: string): boolean {
  const definition = MODULE_BY_ID[moduleId];
  if (!definition || !definition.allowedViews.includes(viewId)) return false;
  if (viewId === "wall" && definition.sensitivity !== "normal") return false;
  return true;
}

export function resolveView(viewId: SurfaceId, profile: LayoutProfile | null): ResolvedView {
  const saved = normalizeProfile(profile).views?.[viewId];
  const overrides = saved?.modules ?? {};

  // The default placements are the universe for this view. A placement that
  // names an unknown module or one not allowed here is a code error, so it
  // is dropped rather than rendered as an empty frame.
  const defaults = (DEFAULT_LAYOUTS[viewId] ?? []).filter((placement) =>
    allowedOnView(viewId, placement.moduleId)
  );

  const byId = new Map<string, ResolvedModule>();
  for (const placement of defaults) {
    if (byId.has(placement.moduleId)) continue;
    const definition = MODULE_BY_ID[placement.moduleId];
    const override = overrides[placement.moduleId] ?? {};
    const defaultWidth = placement.width ?? definition.defaultWidth;
    const defaultDensity = placement.density ?? definition.defaultDensity;
    const width =
      override.width && definition.allowedWidths.includes(override.width)
        ? override.width
        : defaultWidth;
    const density =
      override.density && definition.allowedDensities.includes(override.density)
        ? override.density
        : defaultDensity;
    const enabled = definition.required ? true : override.enabled ?? placement.enabled ?? true;
    // Only the canvas is arranged by hand. The wallboard flows, so it gets a
    // rectangle it never reads rather than an optional field every caller
    // would have to narrow.
    const fallback: TileRect =
      CANVAS_DEFAULT_RECTS[placement.moduleId] ?? { x: 0, y: 0, ...definition.defaultSize };
    const rect = viewId === "canvas" ? clampRect(override.rect ?? fallback, definition.minSize) : fallback;
    byId.set(placement.moduleId, {
      moduleId: placement.moduleId,
      definition,
      width,
      rect,
      density,
      enabled,
    });
  }

  // Saved order first, unknown and duplicate ids skipped, then whatever the
  // profile has never heard of in default order. That is how a module added
  // to code shows up without wiping the preference that was saved before it.
  const ordered: ResolvedModule[] = [];
  const placed = new Set<string>();
  for (const id of [...(saved?.order ?? []), ...byId.keys()]) {
    const entry = byId.get(id);
    if (!entry || placed.has(id)) continue;
    placed.add(id);
    ordered.push(entry);
  }

  return {
    viewId,
    modules: ordered.filter((entry) => entry.enabled),
    hidden: ordered.filter((entry) => !entry.enabled),
  };
}
