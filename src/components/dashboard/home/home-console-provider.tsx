"use client";

// The one place Home's shared state lives: the timeframe, the range built
// from it, the live feed and the rerender tick every section keys off.
//
// Home is not a grid of independent cards. Every section reads the same
// timeframe and the same /api/energy sample, so if the sections fetched for
// themselves a hidden-or-reordered layout would poll several times over and
// show charts for different windows. This provider owns the single useSWR
// call for /api/energy; modules read it through useHomeConsole().

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { buildRange, type Range, type TFMode } from "@/lib/energy-range";
import type { Live } from "@/lib/energy-format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Live poll interval; also the pulse period the house visuals animate on. */
export const LIVE_MS = 3000;
const PERIOD_MS = 30000;

export interface HomeConsoleValue {
  mode: TFMode;
  offset: number;
  range: Range;
  isLive: boolean;
  live: Live | undefined;
  /** Increments on every successful live sample; visuals rerender on it. */
  tick: number;
  liveMs: number;
  changeMode: (mode: TFMode) => void;
  /** Step the period back (-1) or forward (+1); never past the current one. */
  step: (delta: number) => void;
}

const HomeConsoleContext = createContext<HomeConsoleValue | null>(null);

export function HomeConsoleProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<TFMode>("live");
  const [offset, setOffset] = useState(0);
  const isLive = mode === "live";

  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: isLive ? LIVE_MS : PERIOD_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });

  const changeMode = useCallback((next: TFMode) => {
    setMode(next);
    setOffset(0); // jump back to the current period when switching granularity
  }, []);

  const step = useCallback((delta: number) => {
    setOffset((o) => Math.min(0, o + delta));
  }, []);

  // The range is rebuilt on each tick so a rolling live window and the
  // "up to now" edge of the current period keep moving with the data.
  const value = useMemo<HomeConsoleValue>(
    () => ({
      mode,
      offset,
      range: buildRange(mode, offset),
      isLive,
      live,
      tick,
      liveMs: LIVE_MS,
      changeMode,
      step,
    }),
    [mode, offset, isLive, live, tick, changeMode, step]
  );

  return <HomeConsoleContext.Provider value={value}>{children}</HomeConsoleContext.Provider>;
}

export function useHomeConsole(): HomeConsoleValue {
  const context = useContext(HomeConsoleContext);
  if (!context) throw new Error("useHomeConsole must be used inside HomeConsoleProvider");
  return context;
}
