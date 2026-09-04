"use client";

import type { ReactNode } from "react";
import type { ModuleDensity } from "@/lib/layout/types";
import { useHomeConsole } from "@/components/dashboard/home/home-console-provider";
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
 * Home's renderers live apart from the shared map because they read the Home
 * console's context rather than the /api/dashboard payload. Returns null for
 * anything that is not a Home module.
 */
export function homeModuleNode(id: string, ctx: HomeRenderContext): ReactNode {
  void ctx; // no Home module has a density choice yet
  switch (id) {
    case "home.house": return <HouseVisual />;
    case "home.energy": return <EnergySection />;
    case "home.batteries": return <Batteries />;
    case "home.gas": return <Gas />;
    case "home.water": return <Water />;
    case "home.climate": return <Climate />;
    case "home.ventilation": return <Ventilation />;
    case "home.airco": return <Airco />;
    case "home-control": return <HomeControlWidget />;
    case "home.raw-metrics": return <RawMetricsWidget />;
    default: return null;
  }
}
