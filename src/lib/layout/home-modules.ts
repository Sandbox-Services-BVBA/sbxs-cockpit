// Home's module definitions and widget-local timeframe capabilities.
//
// Every Home tile stays on the canvas. Analytical tiles may change their own
// range, but that never changes which neighbouring tiles exist or where they
// sit. All tiles still share one live sample through HomeConsoleProvider.

import type { TFMode } from "@/lib/energy-range";
import type { ModuleDefinition, ModuleWidth, TileSize } from "./types";
import { MIN_TILE_SIZE, TILE_SIZES } from "./grid";

export interface HomeTimeframeConfig {
  modes: TFMode[];
  defaultMode: TFMode;
}

const ALL_RANGES: TFMode[] = ["live", "day", "week", "month", "year"];
const HISTORY_RANGES: TFMode[] = ["day", "week", "month", "year"];

export const HOME_TIMEFRAMES: Record<string, HomeTimeframeConfig> = {
  "home.house": { modes: ALL_RANGES, defaultMode: "live" },
  "home.energy": { modes: ALL_RANGES, defaultMode: "live" },
  "home.batteries": { modes: ALL_RANGES, defaultMode: "live" },
  "home.gas": { modes: HISTORY_RANGES, defaultMode: "week" },
  "home.water": { modes: HISTORY_RANGES, defaultMode: "week" },
  "home.climate": { modes: ALL_RANGES, defaultMode: "live" },
};

export function homeTimeframeConfig(moduleId: string): HomeTimeframeConfig | null {
  return HOME_TIMEFRAMES[moduleId] ?? null;
}

interface HomeSpec {
  title: string;
  defaultWidth: ModuleWidth;
  allowedWidths: ModuleWidth[];
  /** Canvas size, from the same house set the shared catalog uses. */
  size?: keyof typeof TILE_SIZES;
  min?: TileSize;
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
    defaultSize: TILE_SIZES[spec.size ?? "chart"],
    minSize: spec.min ?? MIN_TILE_SIZE,
    defaultDensity: "standard",
    allowedDensities: ["standard"],
    sensitivity: spec.sensitivity ?? "normal",
    dataMode: spec.dataMode ?? "context",
  };
}

const SECTION_WIDTHS: ModuleWidth[] = ["wide", "full"];
const CHART_WIDTHS: ModuleWidth[] = ["standard", "wide", "full"];

export const HOME_MODULES: ModuleDefinition[] = [
  defineHome("home.house", {
    title: "Huis",
    defaultWidth: "full",
    allowedWidths: ["full"],
    size: "scene",
    min: { w: 6, h: 10 },
  }),
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
    size: "wide",
    defaultWidth: "wide",
    allowedWidths: SECTION_WIDTHS,
    sensitivity: "private",
    dataMode: "self-fetch",
  }),
];
