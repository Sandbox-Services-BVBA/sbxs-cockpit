"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, Zap, BarChart3, BatteryCharging, Thermometer, Wind, Droplet } from "lucide-react";
import { PowerNow } from "./sections/power-now";
import { EnergySection } from "./sections/energy-section";
import { Batteries } from "./sections/batteries";
import { Water } from "./sections/water";
import { Climate } from "./sections/climate";
import { Ventilation } from "./sections/ventilation";
import { TimeframeBar } from "./timeframe-bar";
import { buildRange, type TFMode } from "@/lib/energy-range";
import type { Live } from "@/lib/energy-format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const LIVE_MS = 3000;

const NAV = [
  { id: "vermogen", label: "Vermogen", icon: Zap },
  { id: "energie", label: "Energie", icon: BarChart3 },
  { id: "batterij", label: "Batterij", icon: BatteryCharging },
  { id: "water", label: "Water", icon: Droplet },
  { id: "klimaat", label: "Klimaat", icon: Thermometer },
  { id: "ventilatie", label: "Ventilatie", icon: Wind },
];

export function EnergyPage() {
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<TFMode>("live");
  const [offset, setOffset] = useState(0);

  // Rebuild the range when mode/offset change. `tick` keeps the live window
  // sliding forward as new live data arrives.
  const range = useMemo(() => buildRange(mode, offset), [mode, offset, tick]);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b-2 border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-[1400px] px-3 py-2 sm:px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1.5 border-2 border-border px-2 py-1 text-tiny font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground" aria-label="Terug naar dashboard">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <h1 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
              <Zap className="h-4 w-4 text-[#f59e0b]" />
              Energie
            </h1>
            <nav className="ml-auto flex gap-1 overflow-x-auto">
              {NAV.map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  className="flex items-center gap-1 border-2 border-border px-2 py-1 text-mini font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
                >
                  <n.icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{n.label}</span>
                </a>
              ))}
            </nav>
          </div>
          {/* Global timeframe — drives every chart below */}
          <div className="mt-2 border-t-2 border-border pt-2">
            <TimeframeBar range={range} onMode={changeMode} onStep={(d) => setOffset((o) => Math.min(0, o + d))} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-3 p-3 sm:p-4">
        {live?.error ? (
          <div className="border-2 border-[#ff4444] bg-[#ff4444]/10 px-3 py-2 text-petite text-[#ff4444]">Energy monitor: {live.error}</div>
        ) : !live ? (
          <div className="border-2 border-border px-3 py-6 text-center text-petite text-muted-foreground">Verbinden met energy-monitor...</div>
        ) : (
          <>
            <div id="vermogen" className="scroll-mt-32">
              <PowerNow live={live} tick={tick} intervalMs={LIVE_MS} />
            </div>
            <div id="energie" className="scroll-mt-32">
              <EnergySection range={range} />
            </div>
            <div id="batterij" className="scroll-mt-32">
              <Batteries live={live} range={range} />
            </div>
            <div id="water" className="scroll-mt-32">
              <Water range={range} />
            </div>
            <div id="klimaat" className="scroll-mt-32">
              <Climate range={range} />
            </div>
            <div id="ventilatie" className="scroll-mt-32">
              <Ventilation range={range} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
