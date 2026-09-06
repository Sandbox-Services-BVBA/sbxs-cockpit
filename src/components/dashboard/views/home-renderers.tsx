"use client";

import type { ReactNode } from "react";
import type { ModuleDensity } from "@/lib/layout/types";
import { homeModuleApplies } from "@/lib/layout/home-modules";
import { homeModeNow, useHomeConsole } from "@/components/dashboard/home/home-console-provider";
import { HouseFlow } from "@/components/energy/sections/house-flow";
import { HouseScene } from "@/components/energy/sections/house-scene";
import { EnergySection } from "@/components/energy/sections/energy-section";
import { Batteries } from "@/components/energy/sections/batteries";
import { Gas } from "@/components/energy/sections/gas";
import { Water } from "@/components/energy/sections/water";
import { Climate } from "@/components/energy/sections/climate";
import { Ventilation } from "@/components/energy/sections/ventilation";
import { Airco } from "@/components/energy/sections/airco";
import { HomeControlWidget } from "../widgets/home-control-widget";
import { RawMetricsWidget } from "../widgets/raw-metrics-widget";

export interface HomeRenderContext {
  density: ModuleDensity;
}

/**
 * The house visual answers a different question per mode: live is the scene
 * with rooms, flows and unit controls; a period is the flow summary with
 * totals. Both keep their props because the kitchen display reuses HouseFlow
 * outside the console, so this is where the context becomes props.
 */
function HouseVisual() {
  const { isLive, live, range, tick, liveMs } = useHomeConsole();
  return isLive ? (
    <HouseScene live={live} tick={tick} intervalMs={liveMs} />
  ) : (
    <HouseFlow range={range} live={live} tick={tick} intervalMs={liveMs} />
  );
}

/**
 * What the old console showed in place of every section while the energy
 * feed was absent or failing, now per tile: a section handed a sample that
 * is really an error payload would throw into its error boundary instead.
 */
function FeedGate({ children }: { children: ReactNode }) {
  const { live } = useHomeConsole();
  if (live?.error) {
    return (
      <div className="rounded-xl border border-red-600/35 bg-red-600/[0.08] px-4 py-3 text-petite text-red-800 dark:text-red-200">
        Energy monitor: {live.error}
      </div>
    );
  }
  if (!live) {
    return (
      <div className="cockpit-panel px-4 py-8 text-center text-petite text-muted-foreground">
        Verbinden met energy-monitor...
      </div>
    );
  }
  return children;
}

/**
 * True for a Home module that does not apply to the current timeframe. The
 * canvas falls back to the shared renderer when `homeModuleNode` says null,
 * and Office (`home-control`) is in the shared map too, so the canvas has to
 * ask this first or a period would still show the live-only controls.
 */
export function homeModuleHidden(id: string): boolean {
  return !homeModuleApplies(id, homeModeNow());
}

/**
 * Home's renderers live apart from the shared map because they read the Home
 * console's context rather than the /api/dashboard payload. Returns null for
 * anything that is not a Home module, and null for a Home module that does
 * not apply to the current timeframe: gas and water only mean something over
 * a period, the controls only live. The canvas never needs to know that; it
 * just skips a null. It does have to be rendered under `useHomeMode()` so a
 * switch makes it ask again, which is what CockpitPage arranges.
 */
export function homeModuleNode(id: string, ctx: HomeRenderContext): ReactNode {
  void ctx; // no Home module has a density choice yet
  if (homeModuleHidden(id)) return null;
  switch (id) {
    case "home.house": return <FeedGate><HouseVisual /></FeedGate>;
    case "home.energy": return <FeedGate><EnergySection /></FeedGate>;
    case "home.batteries": return <FeedGate><Batteries /></FeedGate>;
    case "home.gas": return <FeedGate><Gas /></FeedGate>;
    case "home.water": return <FeedGate><Water /></FeedGate>;
    case "home.climate": return <FeedGate><Climate /></FeedGate>;
    case "home.ventilation": return <FeedGate><Ventilation /></FeedGate>;
    case "home.airco": return <FeedGate><Airco /></FeedGate>;
    // Office and raw metrics poll their own endpoints; the feed gate would
    // only hide working tiles behind an unrelated outage.
    case "home-control": return <HomeControlWidget />;
    case "home.raw-metrics": return <RawMetricsWidget />;
    default: return null;
  }
}
