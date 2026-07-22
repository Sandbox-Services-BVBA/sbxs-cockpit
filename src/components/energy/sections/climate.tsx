"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Thermometer, Droplets } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Section, Segmented } from "../ui";
import { bucketSpanLabel, bucketTickFmt, type Range } from "@/lib/energy-range";
import { tempColor, type ClimatePoint, type ClimateSeries } from "@/lib/energy-rooms";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// The climate endpoint only speaks a trailing window (`hours=N`); the monitor
// clamps N to 168 (7 days) and pre-buckets to ~300 points per series. So, same
// idiom as gas/water: over-fetch back to range.start — capped at the API limit,
// never the old 8760 — and clip to the selected window client-side. Periods
// reaching further back than 7 days render partially with an honest note until
// the monitor exposes start/end (its internal climateHistory(start, end)
// already takes a range; only the HTTP layer is hours-only).
const MAX_API_HOURS = 168;
const LIVE_HOURS = 6; // the live range is 30 min — too thin for slow-moving climate

interface ClimateHistory {
  hours: number;
  series: ClimateSeries[];
  error?: string;
}
const EMPTY_SERIES: ClimateSeries[] = [];

const REFRESH_MS = 30000;
const INDOOR_COLORS = ["#06b6d4", "#f59e0b", "#a855f7", "#22c55e", "#ec4899", "#3b82f6"];
const OUTDOOR_COLOR = "#94a3b8";

type Metric = "temp" | "rh";
// Chart row: `t` plus per-room keys. Aggregated rows also carry `${room}|band`
// as a [min, max] tuple (Recharts range area) and |min/|max for the tooltip.
type Row = { t: number } & Record<string, number | [number, number] | null>;

// ---- raw view (live + day): one row per sample bucket -----------------------
function mergeSeries(series: ClimateSeries[], metric: Metric): Row[] {
  const byT = new Map<number, Row>();
  for (const s of series) {
    for (const p of s.points) {
      const v = metric === "temp" ? p.temp : p.rh;
      if (v == null) continue;
      let row = byT.get(p.t);
      if (!row) {
        row = { t: p.t };
        byT.set(p.t, row);
      }
      row[s.room] = v;
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

// ---- aggregated view (week/month/year): one row per local day ---------------
interface DayAgg {
  t: number; // local day start (unix s)
  min: number;
  avg: number;
  max: number;
}

function dailyAgg(points: ClimatePoint[], metric: Metric): DayAgg[] {
  const acc = new Map<number, { min: number; max: number; sum: number; n: number }>();
  for (const p of points) {
    const v = metric === "temp" ? p.temp : p.rh;
    if (v == null) continue;
    const d = new Date(p.t * 1000);
    d.setHours(0, 0, 0, 0);
    const t = Math.floor(d.getTime() / 1000);
    const a = acc.get(t);
    if (a) {
      if (v < a.min) a.min = v;
      if (v > a.max) a.max = v;
      a.sum += v;
      a.n += 1;
    } else acc.set(t, { min: v, max: v, sum: v, n: 1 });
  }
  return [...acc.entries()]
    .map(([t, a]) => ({ t, min: a.min, avg: Math.round((a.sum / a.n) * 10) / 10, max: a.max }))
    .sort((a, b) => a.t - b.t);
}

function mergeDaily(series: ClimateSeries[], metric: Metric): Row[] {
  const byT = new Map<number, Row>();
  for (const s of series) {
    for (const d of dailyAgg(s.points, metric)) {
      let row = byT.get(d.t);
      if (!row) {
        row = { t: d.t };
        byT.set(d.t, row);
      }
      row[s.room] = d.avg;
      row[`${s.room}|band`] = [d.min, d.max];
      row[`${s.room}|min`] = d.min;
      row[`${s.room}|max`] = d.max;
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

function latest(s: ClimateSeries, metric: Metric): number | null {
  for (let i = s.points.length - 1; i >= 0; i--) {
    const v = metric === "temp" ? s.points[i].temp : s.points[i].rh;
    if (v != null) return v;
  }
  return null;
}

interface TipEntry {
  name?: string;
  value?: number | [number, number];
  color?: string;
  payload?: Row;
}

function ClimateTooltip({ active, payload, unit }: { active?: boolean; payload?: TipEntry[]; unit: string }) {
  if (!active || !payload?.length) return null;
  const t = payload[0]?.payload?.t;
  const time = typeof t === "number" ? new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }) : "";
  const rows = payload
    .filter((e): e is TipEntry & { value: number } => typeof e.value === "number")
    .sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{time}</div>
      {rows.map((e) => (
        <div key={e.name} className="flex items-center gap-2" style={{ color: e.color }}>
          <span className="inline-block h-1.5 w-3" style={{ background: e.color }} />
          <span className="flex-1">{e.name}</span>
          <span className="font-bold tabular-nums">{e.value.toFixed(1)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

function BandTooltip({ active, payload, unit }: { active?: boolean; payload?: TipEntry[]; unit: string }) {
  if (!active || !payload?.length) return null;
  const t = payload[0]?.payload?.t;
  const day = typeof t === "number" ? bucketSpanLabel(t, "day") : "";
  const rows = payload
    .filter((e): e is TipEntry & { value: number } => typeof e.value === "number")
    .sort((a, b) => b.value - a.value);
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold capitalize text-muted-foreground">{day}</div>
      {rows.map((e) => {
        const min = e.payload?.[`${e.name}|min`];
        const max = e.payload?.[`${e.name}|max`];
        return (
          <div key={e.name} className="flex items-center gap-2" style={{ color: e.color }}>
            <span className="inline-block h-1.5 w-3" style={{ background: e.color }} />
            <span className="flex-1">{e.name}</span>
            {typeof min === "number" && typeof max === "number" && (
              <span className="tabular-nums text-muted-foreground">
                {min.toFixed(1)}–{max.toFixed(1)}
              </span>
            )}
            <span className="font-bold tabular-nums">{e.value.toFixed(1)}{unit}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Climate({ range }: { range: Range }) {
  const [metric, setMetric] = useState<Metric>("temp");
  const unit = metric === "temp" ? "°C" : "%";
  const isLive = range.mode === "live";
  const aggregated = range.mode === "week" || range.mode === "month" || range.mode === "year";

  // The API always returns a trailing window (server clamps to MAX_API_HOURS),
  // so request the max for any period and clip to [start, end) below. Keeps render
  // pure (no Date.now()); "partial" is derived from what actually arrived.
  const hours = isLive ? LIVE_HOURS : MAX_API_HOURS;

  const { data } = useSWR<ClimateHistory>(`/api/energy?climate_history=1&hours=${hours}`, fetcher, {
    refreshInterval: range.canNext ? 0 : REFRESH_MS,
    keepPreviousData: true,
  });

  // Clip the trailing window to the selected period (live keeps the full 6 h).
  const series = useMemo(() => {
    const all = data?.series ?? EMPTY_SERIES;
    if (isLive) return all;
    return all.map((s) => ({ ...s, points: s.points.filter((p) => p.t >= range.start && p.t < range.end) }));
  }, [data, isLive, range.start, range.end]);

  // Partial = the selected period reaches earlier than the API's trailing history,
  // so its oldest part is missing. Derived from the earliest sample that arrived.
  let earliestSample = Infinity;
  if (!isLive) {
    for (const s of data?.series ?? []) for (const p of s.points) if (p.t < earliestSample) earliestSample = p.t;
  }
  const partial = !isLive && Number.isFinite(earliestSample) && earliestSample > range.start + 1800;

  const indoor = useMemo(() => series.filter((s) => !s.outdoor), [series]);
  const outdoor = useMemo(() => series.find((s) => s.outdoor), [series]);
  const rows = useMemo(
    () => (aggregated ? mergeDaily(series, metric) : mergeSeries(series, metric)),
    [series, metric, aggregated]
  );
  const hasData = rows.length > 0;
  const outdoorNow = outdoor ? latest(outdoor, metric) : null;

  const colorFor = (room: string) => {
    const i = indoor.findIndex((s) => s.room === room);
    return i >= 0 ? INDOOR_COLORS[i % INDOOR_COLORS.length] : OUTDOOR_COLOR;
  };
  // Tiles: temperatures wear the comfort color (same scale as the house
  // widgets); humidity keeps the room's series color.
  const valueColor = (fallback: string, v: number | null) =>
    metric === "temp" && v != null ? tempColor({ temp: v, rh: null }) : fallback;

  const windowLabel = isLive ? `laatste ${LIVE_HOURS}u` : partial ? "max 7d historiek" : range.label;
  const notes = [
    aggregated && hasData ? "Daggemiddelde per kamer, band = min–max van die dag." : null,
    partial && hasData ? "De monitor bewaart 7 dagen historiek, alleen dat deel van de periode wordt getoond." : null,
  ].filter((n): n is string => n != null);

  return (
    <Section
      title="Klimaat — temperatuur & vocht"
      icon={Thermometer}
      right={
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-mini text-muted-foreground sm:inline">{windowLabel}</span>
          <Segmented
            options={[
              { value: "temp", label: "Temp" },
              { value: "rh", label: "Vocht" },
            ]}
            value={metric}
            onChange={setMetric}
          />
        </div>
      }
    >
      {data?.error ? (
        <p className="text-petite text-[#ff4444]">Monitor: {data.error}</p>
      ) : !data ? (
        <p className="text-petite text-muted-foreground">Verbinden met energy-monitor...</p>
      ) : !hasData ? (
        <p className="text-petite text-muted-foreground">
          Geen klimaatdata voor {isLive ? "de laatste 6 uur" : range.label}.
          {partial && " De monitor bewaart maar 7 dagen historiek."}
        </p>
      ) : (
        <div className="space-y-3">
          {/* Current-value tiles per room (end of the selected period) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {indoor.map((s) => {
              const v = latest(s, metric);
              return (
                <div key={s.room} className="rounded-xl border border-border px-2.5 py-2">
                  <div className="flex items-center gap-1 text-tiny font-bold uppercase tracking-wide text-muted-foreground">
                    <span className="inline-block h-2 w-2" style={{ background: colorFor(s.room) }} />
                    {s.room}
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums leading-none" style={{ color: valueColor(colorFor(s.room), v) }}>
                    {v != null ? v.toFixed(1) : "—"}
                    <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>
                  </div>
                </div>
              );
            })}
            {outdoor && (
              <div className="rounded-xl border border-dashed border-border px-2.5 py-2">
                <div className="flex items-center gap-1 text-tiny font-bold uppercase tracking-wide" style={{ color: OUTDOOR_COLOR }}>
                  <Droplets className="h-3 w-3" />
                  {outdoor.room}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums leading-none" style={{ color: valueColor(OUTDOOR_COLOR, outdoorNow) }}>
                  {outdoorNow != null ? outdoorNow.toFixed(1) : "—"}
                  <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>
                </div>
              </div>
            )}
          </div>

          {/* History: raw lines for live/day, per-day min–max bands for longer periods */}
          <div className="h-64 -mx-1 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              {aggregated ? (
                <ComposedChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="linear"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={bucketTickFmt("day")}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                    padding={{ left: 8, right: 8 }}
                  />
                  <YAxis orientation="right" domain={metric === "rh" ? [0, 100] : ["auto", "auto"]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}${unit}`} />
                  <Tooltip content={<BandTooltip unit={unit} />} />
                  {indoor.map((s) => (
                    <Area key={`${s.room}|band`} type="monotone" dataKey={`${s.room}|band`} stroke="none" fill={colorFor(s.room)} fillOpacity={0.1} isAnimationActive={false} connectNulls activeDot={false} tooltipType="none" />
                  ))}
                  {outdoor && (
                    <Area key={`${outdoor.room}|band`} type="monotone" dataKey={`${outdoor.room}|band`} stroke="none" fill={OUTDOOR_COLOR} fillOpacity={0.08} isAnimationActive={false} connectNulls activeDot={false} tooltipType="none" />
                  )}
                  {indoor.map((s) => (
                    <Line key={s.room} type="monotone" dataKey={s.room} name={s.room} stroke={colorFor(s.room)} strokeWidth={1.8} dot={{ r: 2, strokeWidth: 0, fill: colorFor(s.room) }} isAnimationActive={false} connectNulls />
                  ))}
                  {outdoor && (
                    <Line key={outdoor.room} type="monotone" dataKey={outdoor.room} name={outdoor.room} stroke={OUTDOOR_COLOR} strokeWidth={3} strokeDasharray="6 4" dot={{ r: 2, strokeWidth: 0, fill: OUTDOOR_COLOR }} isAnimationActive={false} connectNulls />
                  )}
                </ComposedChart>
              ) : (
                <LineChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="linear"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis orientation="right" domain={metric === "rh" ? [0, 100] : ["auto", "auto"]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}${unit}`} />
                  <Tooltip content={<ClimateTooltip unit={unit} />} />
                  {indoor.map((s) => (
                    <Line key={s.room} type="monotone" dataKey={s.room} name={s.room} stroke={colorFor(s.room)} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                  ))}
                  {outdoor && (
                    <Line key={outdoor.room} type="monotone" dataKey={outdoor.room} name={outdoor.room} stroke={OUTDOOR_COLOR} strokeWidth={3} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          {notes.length > 0 && <p className="text-mini text-muted-foreground">{notes.join(" ")}</p>}
        </div>
      )}
    </Section>
  );
}
