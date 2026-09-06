// The shared contract for the module placement engine.
//
// Everything the layout system needs to agree on lives here: what a module is
// allowed to do, what an override may say, and what shape the saved profile
// takes on disk and on the wire. Catalog, resolver, store, API and editor all
// import from this file and nothing imports back into them from here.

import type { SurfaceId, ViewId } from "@/lib/views";

export type { SurfaceId, ViewId };

/** Bump when the saved JSON shape changes in a way the resolver must migrate. */
export const LAYOUT_SCHEMA_VERSION = 1;

/** Semantic width. The grid maps these to spans; modules never set spans. */
export type ModuleWidth = "compact" | "standard" | "wide" | "full";

/** How much a list-heavy module prints. Summary never hides unhealthy rows. */
export type ModuleDensity = "summary" | "standard" | "full";

/**
 * Wallboard policy input. `private` is Bob-only data (bank, health, files),
 * `control` writes something (scenes, ventilation, GPU mode). Neither may ever
 * be placed on the shared display, whatever the saved profile says.
 */
export type ModuleSensitivity = "normal" | "private" | "control";

/**
 * `shared` reads the /api/dashboard payload, `self-fetch` polls on its own and
 * must be unmounted when hidden, `context` reads a view-level provider (Home).
 */
export type ModuleDataMode = "shared" | "self-fetch" | "context";

export interface ModuleDefinition {
  /** Stable forever. Never derive it from the title. */
  id: string;
  title: string;
  /** The domain that owns the module and shows it by default. */
  ownerView: ViewId;
  /** Every view the module may legally appear in, owner included. */
  allowedViews: ViewId[];
  defaultWidth: ModuleWidth;
  allowedWidths: ModuleWidth[];
  defaultDensity: ModuleDensity;
  allowedDensities: ModuleDensity[];
  sensitivity: ModuleSensitivity;
  dataMode: ModuleDataMode;
  /** System chrome: safety signals that customization may not hide. */
  required?: boolean;
}

/** A code-owned default placement. Order is the array index in the view. */
export interface ModulePlacement {
  moduleId: string;
  width?: ModuleWidth;
  density?: ModuleDensity;
  /** Off by default but offerable from the hidden tray. */
  enabled?: boolean;
}

export interface ModuleOverride {
  enabled?: boolean;
  width?: ModuleWidth;
  density?: ModuleDensity;
}

export interface ViewOverride {
  /** Canonical order for this view. Unknown ids are ignored on resolve. */
  order?: string[];
  modules?: Record<string, ModuleOverride>;
}

export interface LayoutProfile {
  schemaVersion: number;
  /** Optimistic concurrency. A stale PUT is rejected with 409. */
  revision: number;
  views?: Partial<Record<SurfaceId, ViewOverride>>;
}

/** What the resolver hands the renderer for one module in one view. */
export interface ResolvedModule {
  moduleId: string;
  definition: ModuleDefinition;
  width: ModuleWidth;
  density: ModuleDensity;
  enabled: boolean;
}

export interface ResolvedView {
  viewId: SurfaceId;
  /** Enabled modules, in canonical order. */
  modules: ResolvedModule[];
  /** Disabled but available modules, for the editor's "Add module" tray. */
  hidden: ResolvedModule[];
}

export const EMPTY_PROFILE: LayoutProfile = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  revision: 0,
};

