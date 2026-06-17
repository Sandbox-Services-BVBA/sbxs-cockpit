"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import type { LayoutMode } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";
import { Thermometer, Droplets } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

// Refresh on the same cadence as the other house widgets (slow-moving data).
const REFRESH_MS = 30000;

// Distinct, theme-friendly colors for the indoor rooms. The outdoor (Buiten)
// series is rendered separately with a standout style, so it is NOT in here.
const INDOOR_COLORS = [
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#a855f7", // purple
  "#22c55e", // green
  "#ec4899", // pink
  "#3b82f6", // blue
];
// Outdoor reference line — neutral slate, thick + dashed so it reads as "outside".
const OUTDOOR_COLOR = "#94a3b8";

type Metric = "temp" | "rh";

const RANGES = [
  { hours: 6, label: "6u" },
  { hours: 24, label: "24u" },
  { hours: 72, label: "3d" },
] as const;

// Recharts wants one row per timestamp with a column per room. The service
// already aligns timestamps across indoor rooms; outdoor (Buiten) is sparser,
// so we merge on `t` and let `connectNulls` bridge the gaps.
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

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  payload?: Record<string, number>;
}

function ClimateTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const t = payload[0]?.payload?.t;
  const time = t
    ? new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })
    : "";
  // Sort highest value first so the legend reads top-to-bottom.
  const rows = [...payload]
    .filter((e) => e.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="border border-border bg-popover px-2 py-1 text-petite shadow-lg space-y-0.5">
      <div className="font-bold text-muted-foreground">{time}</div>
      {rows.map((e) => (
        <div key={e.name} className="flex items-center gap-2" style={{ color: e.color }}>
          <span className="inline-block h-1.5 w-3" style={{ background: e.color }} />
          <span className="flex-1">{e.name}</span>
          <span className="font-bold tabular-nums">
            {e.value?.toFixed(1)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function wideCls(layout: LayoutMode) {
  return layout === "columns"
    ? "energy-wide"
    : layout === "wall"
      ? ""
      : "sm:col-span-2 lg:col-span-4 xl:col-span-6 3xl:col-span-8 4xl:col-span-12";
}

function ClimateWidget({
  layout = "grid",
  metric,
  title,
  unit,
  icon: Icon,
  yDomain,
}: {
  layout?: LayoutMode;
  metric: Metric;
  title: string;
  unit: string;
  icon: typeof Thermometer;
  yDomain: [number, number] | ["auto", "auto"];
}) {
  const [hours, setHours] = useState<number>(24);

  const { data } = useSWR<ClimateHistory>(
    `/api/energy?climate_history=1&hours=${hours}`,
    fetcher,
    { refreshInterval: REFRESH_MS, keepPreviousData: true }
  );

  const series = data?.series ?? [];
  const indoor = useMemo(() => series.filter((s) => !s.outdoor), [series]);
  const outdoor = useMemo(() => series.find((s) => s.outdoor), [series]);
  const merged = useMemo(() => mergeSeries(series, metric), [series, metric]);

  const colorFor = (room: string) => {
    const idx = indoor.findIndex((s) => s.room === room);
    return INDOOR_COLORS[idx % INDOOR_COLORS.length];
  };

  const cls = wideCls(layout);

  if (data?.error) {
    return (
      <WidgetTile title={title} size="sm" className={cls}>
        <p className="text-petite text-[#ff4444]">Monitor: {data.error}</p>
      </WidgetTile>
    );
  }
  if (!data) {
    return (
      <WidgetTile title={title} size="sm" className={cls}>
        <p className="text-petite text-muted-foreground">Verbinden met energy-monitor...</p>
      </WidgetTile>
    );
  }

  const xTickFmt = (t: number) =>
    new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });

  // Latest value per room for the legend chips.
  const latest = (s: ClimateSeries): number | null => {
    for (let i = s.points.length - 1; i >= 0; i--) {
      const v = metric === "temp" ? s.points[i].temp : s.points[i].rh;
      if (v != null) return v;
    }
    return null;
  };

  return (
    <WidgetTile
      title={title}
      size="sm"
      className={cls}
      headerRight={
        <span className="flex items-center gap-1.5 text-tiny font-mono text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {series.length} sensoren
        </span>
      }
    >
      <div className="space-y-2">
        {/* Range selector — same pattern as the energy widget */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex">
            {RANGES.map((r, i) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={cn(
                  "border-2 px-2.5 py-0.5 text-tiny font-bold uppercase tracking-wide transition-colors",
                  i > 0 && "border-l-0",
                  hours === r.hours
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend — indoor rooms with their latest value, outdoor flagged distinct */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-mini text-muted-foreground">
          {indoor.map((s) => {
            const v = latest(s);
            return (
              <span key={s.room} className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-3" style={{ background: colorFor(s.room) }} />
                {s.room}
                {v != null && (
                  <span className="font-bold tabular-nums" style={{ color: colorFor(s.room) }}>
                    {v.toFixed(1)}
                    {unit}
                  </span>
                )}
              </span>
            );
          })}
          {outdoor && (
            <span className="flex items-center gap-1 font-bold" style={{ color: OUTDOOR_COLOR }}>
              <span
                className="inline-block h-0 w-4 border-t-2 border-dashed"
                style={{ borderColor: OUTDOOR_COLOR }}
              />
              {outdoor.room}
              {latest(outdoor) != null && (
                <span className="tabular-nums">
                  {latest(outdoor)!.toFixed(1)}
                  {unit}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="h-72 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="linear"
                domain={["dataMin", "dataMax"]}
                tickFormatter={xTickFmt}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                orientation="right"
                domain={yDomain}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => `${v}${unit}`}
              />
              <Tooltip content={<ClimateTooltip unit={unit} />} />
              {/* Indoor rooms — normal solid lines, distinct colors */}
              {indoor.map((s) => (
                <Line
                  key={s.room}
                  type="monotone"
                  dataKey={s.room}
                  name={s.room}
                  stroke={colorFor(s.room)}
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              {/* Outdoor (Buiten) — thick dashed reference line, rendered last so it sits on top */}
              {outdoor && (
                <Line
                  key={outdoor.room}
                  type="monotone"
                  dataKey={outdoor.room}
                  name={outdoor.room}
                  stroke={OUTDOOR_COLOR}
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </WidgetTile>
  );
}

export function TemperatureWidget({ layout = "grid" }: { layout?: LayoutMode }) {
  return (
    <ClimateWidget
      layout={layout}
      metric="temp"
      title="Temperatuur"
      unit="°C"
      icon={Thermometer}
      yDomain={["auto", "auto"]}
    />
  );
}

export function HumidityWidget({ layout = "grid" }: { layout?: LayoutMode }) {
  return (
    <ClimateWidget
      layout={layout}
      metric="rh"
      title="Vocht"
      unit="%"
      icon={Droplets}
      yDomain={[0, 100]}
    />
  );
}
