// Home's module definitions and default placements.
//
// Home is not a grid of independent cards: every section reads one shared
// timeframe and one live feed, so its modules are `context` modules and the
// console provider supplies that context. Kept in its own file so the Home
// modules never have to touch the shared catalog.
//
// Live/period availability is part of the definition, not a rendering hack.
// Live answers "what is happening right now" (rates, controls, the flow
// picture); period answers "what did we use" (totals over the range). A
// module that does not apply to the current mode is simply not rendered.
// Now that the timeframe is global to the whole page, the same rule applies
// on the canvas: switching to a period hides the controls and shows gas and
// water, in whatever order Bob dragged them into.

import type { ModuleDefinition, ModuleWidth, ResolvedModule } from "./types";

export type HomeMode = "live" | "period";

export interface HomeModuleMeta {
  modes: HomeMode[];
}

const BOTH: HomeMode[] = ["live", "period"];
const LIVE: HomeMode[] = ["live"];
const PERIOD: HomeMode[] = ["period"];

/**
 * Mode availability, keyed by module id. `home-control` (Office) is defined
 * in the shared catalog, so it only gets its Home meta here.
 */
export const HOME_MODULE_META: Record<string, HomeModuleMeta> = {
  "home.house": { modes: BOTH },
  "home.energy": { modes: BOTH },
  "home.batteries": { modes: BOTH },
  "home.gas": { modes: PERIOD },
  "home.water": { modes: PERIOD },
  "home.climate": { modes: BOTH },
  "home.ventilation": { modes: LIVE },
  "home.airco": { modes: LIVE },
  "home-control": { modes: LIVE },
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

// Home modules may live on the canvas, and none may reach the wall: the
// house visual alone shows who is home, what is running and when.
function defineHome(id: string, spec: HomeSpec): ModuleDefinition {
  return {
    id,
    title: spec.title,
    ownerView: "house",
    allowedViews: ["canvas", "house"],
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
 * The house sections in one canonical order, the fallback for a module the
 * canvas profile has never placed. Filtered per mode this gives
 * live: Huis, Energie, Batterij, Klimaat, Ventilatie, Airco, Office (+ raw)
 * period: Huis, Energie, Batterij, Gas, Water, Klimaat.
 */
export function homeModeFor(isLive: boolean): HomeMode {
  return isLive ? "live" : "period";
}

/** True for a non-Home module: the mode only ever hides Home modules. */
export function homeModuleApplies(moduleId: string, mode: HomeMode): boolean {
  const meta = HOME_MODULE_META[moduleId];
  return meta ? meta.modes.includes(mode) : true;
}

/** The resolved Home modules that apply to this mode, order preserved. */
export function homeModulesFor(mode: HomeMode, modules: ResolvedModule[]): ResolvedModule[] {
  return modules.filter(
    (entry) => HOME_MODULE_META[entry.moduleId] !== undefined && homeModuleApplies(entry.moduleId, mode)
  );
}
