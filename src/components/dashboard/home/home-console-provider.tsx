"use client";

// Home has one shared live feed, but no shared timeframe. Each analytical
// widget owns its own range so changing Energy from live to week cannot move,
// mount or unmount anything else on the canvas. The selection lives in local
// storage because it is a personal display preference, not dashboard data or
// layout geometry.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { buildRange, type Range, type TFMode } from "@/lib/energy-range";
import type { Live } from "@/lib/energy-format";
import {
  homeTimeframeConfig,
  type HomeTimeframeConfig,
} from "@/lib/layout/home-modules";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

/** Live poll interval; also the pulse period the house visuals animate on. */
export const LIVE_MS = 3000;
const STORAGE_KEY = "sbxs-cockpit:home-timeframes:v1";

interface TimeframeSelection {
  mode: TFMode;
  offset: number;
}

type TimeframeSelections = Record<string, TimeframeSelection>;

interface HomeFeedValue {
  live: Live | undefined;
  /** Increments on every successful live sample; visuals rerender on it. */
  tick: number;
  liveMs: number;
  selections: TimeframeSelections;
  changeMode: (moduleId: string, mode: TFMode) => void;
  step: (moduleId: string, delta: number) => void;
}

export interface HomeConsoleValue {
  moduleId: string;
  mode: TFMode;
  offset: number;
  range: Range;
  isLive: boolean;
  live: Live | undefined;
  tick: number;
  liveMs: number;
  changeMode: (mode: TFMode) => void;
  step: (delta: number) => void;
}

export interface HomeTimeframeControl {
  config: HomeTimeframeConfig;
  mode: TFMode;
  range: Range;
  changeMode: (mode: TFMode) => void;
  step: (delta: number) => void;
}

const HomeFeedContext = createContext<HomeFeedValue | null>(null);
const HomeConsoleContext = createContext<HomeConsoleValue | null>(null);

function validSelection(
  value: unknown,
  config: HomeTimeframeConfig,
): TimeframeSelection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TimeframeSelection>;
  if (!config.modes.includes(candidate.mode as TFMode)) return null;
  if (!Number.isInteger(candidate.offset) || (candidate.offset ?? 1) > 0) return null;
  return { mode: candidate.mode as TFMode, offset: candidate.offset as number };
}

function readStoredSelections(): TimeframeSelections {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const next: TimeframeSelections = {};
    for (const [moduleId, value] of Object.entries(parsed)) {
      const config = homeTimeframeConfig(moduleId);
      if (!config) continue;
      const selection = validSelection(value, config);
      if (selection) next[moduleId] = selection;
    }
    return next;
  } catch {
    return {};
  }
}

export function HomeConsoleProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [selections, setSelections] = useState<TimeframeSelections>({});
  const loaded = useRef(false);

  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: LIVE_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((value) => value + 1),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelections(readStoredSelections());
      loaded.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
    } catch {
      // A blocked storage API must not make a monitoring surface unusable.
    }
  }, [selections]);

  const changeMode = useCallback((moduleId: string, mode: TFMode) => {
    const config = homeTimeframeConfig(moduleId);
    if (!config?.modes.includes(mode)) return;
    setSelections((current) => ({
      ...current,
      [moduleId]: { mode, offset: 0 },
    }));
  }, []);

  const step = useCallback((moduleId: string, delta: number) => {
    const config = homeTimeframeConfig(moduleId);
    if (!config) return;
    setSelections((current) => {
      const selection = current[moduleId] ?? { mode: config.defaultMode, offset: 0 };
      if (selection.mode === "live") return current;
      return {
        ...current,
        [moduleId]: { ...selection, offset: Math.min(0, selection.offset + delta) },
      };
    });
  }, []);

  const value = useMemo<HomeFeedValue>(
    () => ({ live, tick, liveMs: LIVE_MS, selections, changeMode, step }),
    [live, tick, selections, changeMode, step],
  );

  return <HomeFeedContext.Provider value={value}>{children}</HomeFeedContext.Provider>;
}

function useHomeFeed(): HomeFeedValue {
  const context = useContext(HomeFeedContext);
  if (!context) throw new Error("Home widgets must be inside HomeConsoleProvider");
  return context;
}

function selectionFor(
  moduleId: string,
  selections: TimeframeSelections,
): TimeframeSelection {
  const config = homeTimeframeConfig(moduleId);
  return selections[moduleId] ?? { mode: config?.defaultMode ?? "live", offset: 0 };
}

/** Supplies the existing energy sections with the range for one tile only. */
export function HomeModuleProvider({
  moduleId,
  children,
}: {
  moduleId: string;
  children: ReactNode;
}) {
  const feed = useHomeFeed();
  const selection = selectionFor(moduleId, feed.selections);
  const range = buildRange(selection.mode, selection.offset);
  const value = useMemo<HomeConsoleValue>(
    () => ({
      moduleId,
      mode: selection.mode,
      offset: selection.offset,
      range,
      isLive: selection.mode === "live",
      live: feed.live,
      tick: feed.tick,
      liveMs: feed.liveMs,
      changeMode: (mode) => feed.changeMode(moduleId, mode),
      step: (delta) => feed.step(moduleId, delta),
    }),
    [moduleId, selection.mode, selection.offset, range, feed],
  );

  return <HomeConsoleContext.Provider value={value}>{children}</HomeConsoleContext.Provider>;
}

/** Optional tile-menu model. Non-analytical modules return null. */
export function useHomeTimeframeControl(moduleId: string): HomeTimeframeControl | null {
  const feed = useHomeFeed();
  const config = homeTimeframeConfig(moduleId);
  if (!config) return null;
  const selection = selectionFor(moduleId, feed.selections);
  return {
    config,
    mode: selection.mode,
    range: buildRange(selection.mode, selection.offset),
    changeMode: (mode) => feed.changeMode(moduleId, mode),
    step: (delta) => feed.step(moduleId, delta),
  };
}

export function useHomeConsole(): HomeConsoleValue {
  const context = useContext(HomeConsoleContext);
  if (!context) throw new Error("useHomeConsole must be used inside HomeModuleProvider");
  return context;
}
