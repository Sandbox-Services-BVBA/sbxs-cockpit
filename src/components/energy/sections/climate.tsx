"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Thermometer, Droplets } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Section, Segmented } from "../ui";
import type { Range, TFMode } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Climate history is rolling "last N hours" only, so map the global timeframe to
// a duration. At the current period this lines up with the other sections.
const HOURS_FOR: Record<TFMode, number> = { live: 6, day: 24, week: 168, month: 720, year: 8760 };

interface ClimatePoint {
  t: number;
  temp: number | null;
  rh: number | null;
}
interface ClimateSeries {
  room: string;
  outdoor: boolean;
  points: ClimatePoint[];
}
interface ClimateHistory {
  hours: number;
  series: ClimateSeries[];
  error?: string;
}

const REFRESH_MS = 30000;
const INDOOR_COLORS = ["#06b6d4", "#f59e0b", "#a855f7", "#22c55e", "#ec4899", "#3b82f6"];
const OUTDOOR_COLOR = "#94a3b8";

type Metric = "temp" | "rh";

function mergeSeries(series: ClimateSeries[], metric: Metric) {
  const byT = new Map<number, Record<string, number | null>>();
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
  return Array.from(byT.values()).sort((a, b) => (a.t as number) - (b.t as number));
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
  value?: number;
  color?: string;
  payload?: Record<string, number>;
}
function ClimateTooltip({ active, payload, unit }: { active?: boolean; payload?: TipEntry[]; unit: string }) {
  if (!active || !payload?.length) return null;
  const t = payload[0]?.payload?.t;
  const time = t ? new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }) : "";
  const rows = [...payload].filter((e) => e.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="space-y-0.5 border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{time}</div>
      {rows.map((e) => (
        <div key={e.name} className="flex items-center gap-2" style={{ color: e.color }}>
          <span className="inline-block h-1.5 w-3" style={{ background: e.color }} />
          <span className="flex-1">{e.name}</span>
          <span className="font-bold tabular-nums">{e.value?.toFixed(1)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Climate({ range }: { range: Range }) {
  const hours = HOURS_FOR[range.mode];
  const [metric, setMetric] = useState<Metric>("temp");
  const unit = metric === "temp" ? "°C" : "%";

  const { data } = useSWR<ClimateHistory>(`/api/energy?climate_history=1&hours=${hours}`, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
  });

  const series = data?.series ?? [];
  const indoor = useMemo(() => series.filter((s) => !s.outdoor), [series]);
  const outdoor = useMemo(() => series.find((s) => s.outdoor), [series]);
  const merged = useMemo(() => mergeSeries(series, metric), [series, metric]);
  const colorFor = (room: string) => INDOOR_COLORS[indoor.findIndex((s) => s.room === room) % INDOOR_COLORS.length];

  return (
    <Section
      title="Klimaat — temperatuur & vocht"
      icon={Thermometer}
      right={
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-mini text-muted-foreground sm:inline">laatste {hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}u`}</span>
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
      ) : (
        <div className="space-y-3">
          {/* Current-value tiles per room */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {indoor.map((s) => {
              const v = latest(s, metric);
              return (
                <div key={s.room} className="border-2 border-border px-2.5 py-2">
                  <div className="flex items-center gap-1 text-tiny font-bold uppercase tracking-wide text-muted-foreground">
                    <span className="inline-block h-2 w-2" style={{ background: colorFor(s.room) }} />
                    {s.room}
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums leading-none" style={{ color: colorFor(s.room) }}>
                    {v != null ? v.toFixed(1) : "—"}
                    <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>
                  </div>
                </div>
              );
            })}
            {outdoor && (
              <div className="border-2 border-dashed border-border px-2.5 py-2">
                <div className="flex items-center gap-1 text-tiny font-bold uppercase tracking-wide" style={{ color: OUTDOOR_COLOR }}>
                  <Droplets className="h-3 w-3" />
                  {outdoor.room}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums leading-none" style={{ color: OUTDOOR_COLOR }}>
                  {latest(outdoor, metric) != null ? latest(outdoor, metric)!.toFixed(1) : "—"}
                  <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>
                </div>
              </div>
            )}
          </div>

          {/* History lines */}
          <div className="h-64 -mx-1 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merged} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
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
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Section>
  );
}
