"use client";

import { useState } from "react";
import useSWR from "swr";
import { BarChart3, BatteryCharging, Droplet, Flame, Lightbulb, Thermometer, Wind, Zap } from "lucide-react";
import { PowerNow } from "@/components/energy/sections/power-now";
import { EnergySection } from "@/components/energy/sections/energy-section";
import { Batteries } from "@/components/energy/sections/batteries";
import { Water } from "@/components/energy/sections/water";
import { Climate } from "@/components/energy/sections/climate";
import { Ventilation } from "@/components/energy/sections/ventilation";
import { TimeframeBar } from "@/components/energy/timeframe-bar";
import { buildRange, type TFMode } from "@/lib/energy-range";
import type { Live } from "@/lib/energy-format";
import { GasWidget } from "./widgets/gas-widget";
import { HomeControlWidget } from "./widgets/home-control-widget";
import { RawMetricsWidget } from "./widgets/raw-metrics-widget";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const LIVE_MS = 3000;

const NAV = [
  { id: "vermogen", label: "Vermogen", icon: Zap },
  { id: "energie", label: "Energie", icon: BarChart3 },
  { id: "batterij", label: "Batterij", icon: BatteryCharging },
  { id: "gas", label: "Gas", icon: Flame },
  { id: "water", label: "Water", icon: Droplet },
  { id: "klimaat", label: "Klimaat", icon: Thermometer },
  { id: "ventilatie", label: "Ventilatie", icon: Wind },
  { id: "office", label: "Office", icon: Lightbulb },
];

// The single home view: the full energy console plus the house-only widgets
// (gas, office control, raw telemetry) that the console has no section for.
export function HouseConsole() {
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<TFMode>("live");
  const [offset, setOffset] = useState(0);

  // The live-data tick rerenders the view, keeping this rolling range current.
  const range = buildRange(mode, offset);

  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: LIVE_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });

  const changeMode = (m: TFMode) => {
    setMode(m);
    setOffset(0); // jump back to the current period when switching granularity
  };

  return (
    <div className="space-y-3">
      {/* Anchors + the global timeframe that drives every chart below. */}
      <div className="sticky top-[76px] z-20 -mx-4 border-b border-border/70 bg-background/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 xl:-mx-8 xl:px-8">
        <nav aria-label="Home sections" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card/70 px-2.5 py-1 text-mini font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <n.icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{n.label}</span>
            </a>
          ))}
        </nav>
        <TimeframeBar range={range} onMode={changeMode} onStep={(d) => setOffset((o) => Math.min(0, o + d))} />
      </div>

      {live?.error ? (
        <div className="rounded-xl border border-red-600/35 bg-red-600/[0.08] px-4 py-3 text-petite text-red-800 dark:text-red-200">
          Energy monitor: {live.error}
        </div>
      ) : !live ? (
        <div className="cockpit-panel px-4 py-8 text-center text-petite text-muted-foreground">
          Verbinden met energy-monitor...
        </div>
      ) : (
        <>
          <div id="vermogen" className="scroll-mt-40">
            <PowerNow live={live} tick={tick} intervalMs={LIVE_MS} />
          </div>
          <div id="energie" className="scroll-mt-40">
            <EnergySection range={range} />
          </div>
          <div id="batterij" className="scroll-mt-40">
            <Batteries live={live} range={range} />
          </div>
          <div id="gas" className="grid scroll-mt-40 grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-6">
            <GasWidget layout="grid" />
          </div>
          <div id="water" className="scroll-mt-40">
            <Water range={range} />
          </div>
          <div id="klimaat" className="scroll-mt-40">
            <Climate range={range} />
          </div>
          <div id="ventilatie" className="scroll-mt-40">
            <Ventilation range={range} />
          </div>
          <div id="office" className="grid scroll-mt-40 grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-6">
            <HomeControlWidget />
            <RawMetricsWidget />
          </div>
        </>
      )}
    </div>
  );
}
