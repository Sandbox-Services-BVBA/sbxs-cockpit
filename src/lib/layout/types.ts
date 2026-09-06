// The shared contract for the module placement engine.
//
// Everything the layout system needs to agree on lives here: what a module is
// allowed to do, what an override may say, and what shape the saved profile
// takes on disk and on the wire. Catalog, resolver, store, API and editor all
// import from this file and nothing imports back into them from here.

import type { SurfaceId, ViewId } from "@/lib/views";

export type { SurfaceId, ViewId };

/** Bump when the saved JSON shape changes in a way the resolver must migrate. */
export const LAYOUT_SCHEMA_VERSION = 2;

/**
 * Where a tile sits on the canvas plane, in grid cells. x and y count from
 * the top-left corner, w and h are the span. Pixels are the grid's business
 * (lib/layout/grid.ts); nothing outside it converts between the two.
 *
 * Only the canvas uses rectangles. The wallboard is not arranged by hand and
 * keeps the twelve-column flow, so it reads `order` and `width` instead.
 */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A tile's size in grid cells, without a position. */
export interface TileSize {
  w: number;
  h: number;
}

/**
 * Semantic width, for the wallboard's flow grid only. The canvas resizes
 * freely and stores a rectangle instead.
 */
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
  /** The size the module takes on the canvas before Bob touches it. */
  defaultSize: TileSize;
  /** The floor a resize may not go below, because it stops being readable. */
  minSize: TileSize;
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
  /** Canvas size in cells. Position is packed from the declaration order. */
  size?: TileSize;
  density?: ModuleDensity;
  /** Off by default but offerable from the hidden tray. */
  enabled?: boolean;
}

export interface ModuleOverride {
  enabled?: boolean;
  /** Wallboard only. */
  width?: ModuleWidth;
  density?: ModuleDensity;
  /** Canvas only: where Bob dragged and resized the tile to. */
  rect?: TileRect;
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
  /** Canvas placement. Resolved for every view; the wallboard ignores it. */
  rect: TileRect;
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

