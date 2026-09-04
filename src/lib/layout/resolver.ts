// The pure layout resolver: catalog defaults plus a saved profile in, the
// effective layout out. No React, no IO, nothing that cannot run in a test.
//
// The profile is treated as untrusted input from an older version of the
// app, another device, or a hand-edited row: every id, enum and shape is
// checked against the catalog, and anything that does not fit is dropped
// rather than thrown. Unknown module ids never reach the output.

import { VIEW_BY_ID } from "@/lib/views";
import { MODULE_BY_ID } from "./catalog";
import { DEFAULT_DOMAIN_ORDER, DEFAULT_LAYOUTS, DEFAULT_MOBILE_PINS } from "./default-layouts";
import {
  EMPTY_PROFILE,
  LAYOUT_SCHEMA_VERSION,
  MOBILE_PIN_COUNT,
  type DomainOverride,
  type LayoutProfile,
  type ModuleDensity,
  type ModuleOverride,
  type ModuleWidth,
  type ResolvedDomain,
  type ResolvedLayout,
  type ResolvedModule,
  type ResolvedView,
  type ViewId,
  type ViewOverride,
} from "./types";

const WIDTHS: ModuleWidth[] = ["compact", "standard", "wide", "full"];
const DENSITIES: ModuleDensity[] = ["summary", "standard", "full"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isViewId(value: string): value is ViewId {
  return Object.prototype.hasOwnProperty.call(VIEW_BY_ID, value);
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalEnum<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : undefined;
}

function normalizeModuleOverride(raw: unknown): ModuleOverride | undefined {
  if (!isRecord(raw)) return undefined;
  const override: ModuleOverride = {};
  const enabled = optionalBoolean(raw.enabled);
  const width = optionalEnum(raw.width, WIDTHS);
  const density = optionalEnum(raw.density, DENSITIES);
  if (enabled !== undefined) override.enabled = enabled;
  if (width) override.width = width;
  if (density) override.density = density;
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

function normalizeDomainOverride(raw: unknown): DomainOverride | undefined {
  if (!isRecord(raw)) return undefined;
  const domain: DomainOverride = {};
  const visible = optionalBoolean(raw.visible);
  const mobilePinned = optionalBoolean(raw.mobilePinned);
  if (visible !== undefined) domain.visible = visible;
  if (mobilePinned !== undefined) domain.mobilePinned = mobilePinned;
  if (typeof raw.order === "number" && Number.isFinite(raw.order)) domain.order = raw.order;
  return domain;
}

/**
 * Coerce whatever came off the wire or out of the database into a profile
 * the resolver can trust. Anything of the wrong schema version resolves to
 * the defaults; inside a good profile, malformed fields are dropped one by
 * one so a single bad value does not cost Bob the rest of his layout.
 */
export function normalizeProfile(raw: unknown): LayoutProfile {
  if (!isRecord(raw) || raw.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
    return { ...EMPTY_PROFILE };
  }
  const profile: LayoutProfile = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    revision:
      typeof raw.revision === "number" && Number.isInteger(raw.revision) && raw.revision >= 0
        ? raw.revision
        : 0,
  };
  if (isRecord(raw.domains)) {
    const domains: LayoutProfile["domains"] = {};
    for (const [id, value] of Object.entries(raw.domains)) {
      if (!isViewId(id)) continue;
      const domain = normalizeDomainOverride(value);
      if (domain) domains[id] = domain;
    }
    profile.domains = domains;
  }
  if (isRecord(raw.views)) {
    const views: LayoutProfile["views"] = {};
    for (const [id, value] of Object.entries(raw.views)) {
      if (!isViewId(id)) continue;
      const view = normalizeViewOverride(value);
      if (view) views[id] = view;
    }
    profile.views = views;
  }
  return profile;
}

/** The wall is a shared screen: private data and write controls stay off it. */
function allowedOnView(viewId: ViewId, moduleId: string): boolean {
  const definition = MODULE_BY_ID[moduleId];
  if (!definition || !definition.allowedViews.includes(viewId)) return false;
  if (viewId === "wall" && definition.sensitivity !== "normal") return false;
  return true;
}

export function resolveView(viewId: ViewId, profile: LayoutProfile | null): ResolvedView {
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
    byId.set(placement.moduleId, { moduleId: placement.moduleId, definition, width, density, enabled });
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

/** A domain before pins are settled: `pinned` is the raw saved flag, if any. */
interface DomainState {
  viewId: ViewId;
  visible: boolean;
  pinned?: boolean;
}

function resolveDomains(profile: LayoutProfile): DomainState[] {
  const overrides = profile.domains ?? {};
  return DEFAULT_DOMAIN_ORDER.map((viewId, index) => ({
    viewId,
    index,
    visible: overrides[viewId]?.visible ?? true,
    pinned: overrides[viewId]?.mobilePinned,
    order: overrides[viewId]?.order ?? index,
  }))
    // A saved order wins; unspecified domains keep their default slot, and
    // ties fall back to the default order so the sort is deterministic.
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ viewId, visible, pinned }) => ({ viewId, visible, pinned }));
}

/**
 * Exactly MOBILE_PIN_COUNT ids for the bottom bar. A profile that has saved
 * any pin at all replaces the default set outright; one that never touched
 * pins keeps the defaults. Either way only visible domains count, the
 * visible navigation order tops the bar up, and hidden domains fill it only
 * as a last resort: their routes stay valid, and an empty slot on the phone
 * is worse than a hidden one.
 */
function resolveMobilePins(domains: DomainState[]): ViewId[] {
  const anySaved = domains.some((domain) => domain.pinned !== undefined);
  const visible = domains.filter((domain) => domain.visible);
  const preferred = visible.filter((domain) =>
    anySaved ? domain.pinned === true : DEFAULT_MOBILE_PINS.includes(domain.viewId)
  );

  const pins: ViewId[] = [];
  for (const domain of [...preferred, ...visible, ...domains]) {
    if (pins.length >= MOBILE_PIN_COUNT) break;
    if (!pins.includes(domain.viewId)) pins.push(domain.viewId);
  }
  return pins;
}

export function resolveLayout(profile: LayoutProfile | null): ResolvedLayout {
  const clean = normalizeProfile(profile);
  const allDomains = resolveDomains(clean);
  const mobilePins = resolveMobilePins(allDomains);
  const domains: ResolvedDomain[] = allDomains
    .filter((domain) => domain.visible)
    .map(({ viewId, visible }) => ({ viewId, visible, mobilePinned: mobilePins.includes(viewId) }));
  const views = Object.fromEntries(
    DEFAULT_DOMAIN_ORDER.map((viewId) => [viewId, resolveView(viewId, clean)])
  ) as Record<ViewId, ResolvedView>;
  return { domains, mobilePins, views };
}
