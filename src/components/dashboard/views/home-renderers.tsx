"use client";

import type { ReactNode } from "react";
import type { ModuleDensity } from "@/lib/layout/types";
import {
  HomeModuleProvider,
  useHomeConsole,
} from "@/components/dashboard/home/home-console-provider";
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
 * totals. This is where the tile-local context becomes explicit props for the
 * two established visuals.
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
/**
 * Home's sections come from the standalone energy console, where each one is
 * as tall as it needs to be. On the board a tile has the height it was
 * dragged to, so the section is handed that box. The scrolling belongs to
 * the section's own body, not to this wrapper: scrolling the wrapper would
 * move the whole card, rounded corners and all, under the clip.
 */
function HomeTile({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0">{children}</div>;
}

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
 * Home's renderers live apart from the shared map because they read the Home
 * feed and, for analytical widgets, a tile-local timeframe. Returns null only
 * for ids that are not Home modules; changing a range never removes a tile.
 */
export function homeModuleNode(id: string, ctx: HomeRenderContext): ReactNode {
  void ctx; // no Home module has a density choice yet
  const gated = (node: ReactNode) => (
    <HomeModuleProvider moduleId={id}>
      <HomeTile>
        <FeedGate>{node}</FeedGate>
      </HomeTile>
    </HomeModuleProvider>
  );
  switch (id) {
    case "home.house": return gated(<HouseVisual />);
    case "home.energy": return gated(<EnergySection />);
    case "home.batteries": return gated(<Batteries />);
    case "home.gas": return gated(<Gas />);
    case "home.water": return gated(<Water />);
    case "home.climate": return gated(<Climate />);
    case "home.ventilation": return gated(<Ventilation />);
    case "home.airco": return gated(<Airco />);
    // Office and raw metrics poll their own endpoints; the feed gate would
    // only hide working tiles behind an unrelated outage.
    case "home-control": return <HomeControlWidget />;
    case "home.raw-metrics": return <RawMetricsWidget />;
    default: return null;
  }
}
