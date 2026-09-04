// Home's module definitions and default placements.
//
// Home is not a grid of independent cards: every section reads one shared
// timeframe and one live feed, so its modules are `context` modules and the
// console provides that context. Kept in its own file so the Home migration
// never has to touch the shared catalog.
//
// Live/period availability is part of the definition, not a rendering hack.
// Live answers "what is happening right now" (rates, controls, the flow
// picture); period answers "what did we use" (totals over the range). A
// module that does not apply to the current mode is simply not placed, and
// its anchor disappears with it. One canonical order serves both modes.

import type { ModuleDefinition, ModulePlacement, ModuleWidth, ResolvedModule } from "./types";

export type HomeMode = "live" | "period";

export interface HomeAnchor {
  /** The section's DOM id, also the hash the sticky nav scrolls to. */
  id: string;
  /** Dutch, like the rest of the Home UI. */
  label: string;
  /** Keep the DOM id (deep links still land) but leave it out of the sticky nav. */
  inNav?: boolean;
}

export interface HomeModuleMeta {
  modes: HomeMode[];
  /** Per mode, because the same block reads differently: Verloop vs Energie. */
  anchor?: Partial<Record<HomeMode, HomeAnchor>>;
}

const BOTH: HomeMode[] = ["live", "period"];
const LIVE: HomeMode[] = ["live"];
const PERIOD: HomeMode[] = ["period"];

const both = (id: string, label: string): HomeModuleMeta["anchor"] => ({
  live: { id, label },
  period: { id, label },
});

/**
 * Mode availability and anchors, keyed by module id. `home-control` (Office)
 * is defined in the shared catalog, so it only gets its Home meta here.
 */
export const HOME_MODULE_META: Record<string, HomeModuleMeta> = {
  "home.house": { modes: BOTH, anchor: both("huis", "Huis") },
  "home.energy": {
    modes: BOTH,
    anchor: { live: { id: "verloop", label: "Verloop" }, period: { id: "energie", label: "Energie" } },
  },
  // The battery section shows in both modes, but the period nav has never
  // listed it: five entries plus Batteries is what the console always drew.
  "home.batteries": {
    modes: BOTH,
    anchor: { live: { id: "batterij", label: "Batterij" }, period: { id: "batterij", label: "Batterij", inNav: false } },
  },
  "home.gas": { modes: PERIOD, anchor: { period: { id: "gas", label: "Gas" } } },
  "home.water": { modes: PERIOD, anchor: { period: { id: "water", label: "Water" } } },
  "home.climate": { modes: BOTH, anchor: both("klimaat", "Klimaat") },
  "home.ventilation": { modes: LIVE, anchor: { live: { id: "ventilatie", label: "Ventilatie" } } },
  "home.airco": { modes: LIVE, anchor: { live: { id: "airco", label: "Airco" } } },
  "home-control": { modes: LIVE, anchor: { live: { id: "office", label: "Office" } } },
  // Raw metrics sits beside Office without an anchor of its own, as today.
  "home.raw-metrics": { modes: LIVE },
};

interface HomeSpec {
  title: string;
  defaultWidth: ModuleWidth;
  allowedWidths: ModuleWidth[];
  /** Ventilation and airco write to the house; raw metrics is Bob-only. */
  sensitivity?: ModuleDefinition["sensitivity"];
  /** Raw metrics polls its own endpoints and never reads the provider. */
  dataMode?: ModuleDefinition["dataMode"];
}

// Home modules stay on Home in this release and none may reach the wall:
// the house visual alone shows who is home, what is running and when.
function defineHome(id: string, spec: HomeSpec): ModuleDefinition {
  return {
    id,
    title: spec.title,
    ownerView: "house",
    allowedViews: ["house"],
    defaultWidth: spec.defaultWidth,
    allowedWidths: spec.allowedWidths,
    defaultDensity: "standard",
    allowedDensities: ["standard"],
    sensitivity: spec.sensitivity ?? "normal",
    dataMode: spec.dataMode ?? "context",
  };
}

const SECTION_WIDTHS: ModuleWidth[] = ["wide", "full"];
const CHART_WIDTHS: ModuleWidth[] = ["standard", "wide", "full"];

export const HOME_MODULES: ModuleDefinition[] = [
  defineHome("home.house", { title: "Huis", defaultWidth: "full", allowedWidths: ["full"] }),
  defineHome("home.energy", { title: "Energie", defaultWidth: "full", allowedWidths: SECTION_WIDTHS }),
  defineHome("home.batteries", { title: "Batterij", defaultWidth: "full", allowedWidths: SECTION_WIDTHS }),
  defineHome("home.gas", { title: "Gas", defaultWidth: "full", allowedWidths: CHART_WIDTHS }),
  defineHome("home.water", { title: "Water", defaultWidth: "full", allowedWidths: CHART_WIDTHS }),
  defineHome("home.climate", { title: "Klimaat", defaultWidth: "full", allowedWidths: SECTION_WIDTHS }),
  defineHome("home.ventilation", {
    title: "Ventilatie",
    defaultWidth: "full",
    allowedWidths: SECTION_WIDTHS,
    sensitivity: "control",
  }),
  defineHome("home.airco", {
    title: "Airco",
    defaultWidth: "full",
    allowedWidths: SECTION_WIDTHS,
    sensitivity: "control",
  }),
  // Two thirds of the row, next to the standard-width Office tile: the same
  // 2:4 split the old office grid drew.
  defineHome("home.raw-metrics", {
    title: "Live metrics",
    defaultWidth: "wide",
    allowedWidths: SECTION_WIDTHS,
    sensitivity: "private",
    dataMode: "self-fetch",
  }),
];

/**
 * Today's Home, in one canonical order. Filtered per mode this gives
 * live: Huis, Verloop, Batterij, Klimaat, Ventilatie, Airco, Office (+ raw)
 * period: Huis, Energie, Batterij, Gas, Water, Klimaat.
 */
export const HOME_LAYOUT: ModulePlacement[] = [
  { moduleId: "home.house" },
  { moduleId: "home.energy" },
  { moduleId: "home.batteries" },
  { moduleId: "home.gas" },
  { moduleId: "home.water" },
  { moduleId: "home.climate" },
  { moduleId: "home.ventilation" },
  { moduleId: "home.airco" },
  { moduleId: "home-control" },
  { moduleId: "home.raw-metrics" },
];

export function homeModeFor(isLive: boolean): HomeMode {
  return isLive ? "live" : "period";
}

/** The resolved Home modules that apply to this mode, order preserved. */
export function homeModulesFor(mode: HomeMode, modules: ResolvedModule[]): ResolvedModule[] {
  return modules.filter((entry) => HOME_MODULE_META[entry.moduleId]?.modes.includes(mode));
}

export interface HomeNavEntry {
  moduleId: string;
  id: string;
  label: string;
}

/** The sticky nav, derived from what is actually placed: hide a module, lose its anchor. */
export function homeAnchorsFor(mode: HomeMode, modules: ResolvedModule[]): HomeNavEntry[] {
  const entries: HomeNavEntry[] = [];
  for (const entry of homeModulesFor(mode, modules)) {
    const anchor = HOME_MODULE_META[entry.moduleId]?.anchor?.[mode];
    if (anchor && anchor.inNav !== false) entries.push({ moduleId: entry.moduleId, id: anchor.id, label: anchor.label });
  }
  return entries;
}

/** The DOM id a placed module gets in this mode, if it is an anchor target. */
export function homeAnchorId(mode: HomeMode, moduleId: string): string | undefined {
  return HOME_MODULE_META[moduleId]?.anchor?.[mode]?.id;
}
