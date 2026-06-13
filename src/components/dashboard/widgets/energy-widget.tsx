"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { Sun, BatteryCharging, Home, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Battery {
  ip: string;
  online: boolean;
  soc: number | null;
  power_w: number;
  temp_c: number | null;
  capacity_wh: number | null;
  rated_wh: number;
  mode: string | null;
}
interface Live {
  ts: number;
  grid_w: number;
  solar_w: number;
  bat_w: number; // + discharge, - charge
  house_w: number;
  soc_avg: number | null;
  stored_wh: number;
  rated_wh: number;
  batteries: Battery[];
  grid?: { monthly_peak_w?: number; tariff?: number };
  solar?: { total_yield_kwh?: number | null };
  error?: string;
}
interface HistPoint {
  t: number;
  grid_w: number;
  solar_w: number;
  bat_w: number;
  house_w: number;
  soc_avg: number;
}

// Local (Belgian) midnight for `today + offset`, as a unix-seconds day window.
function dayWindow(offset: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const start = Math.floor(d.getTime() / 1000) + offset * 86400;
  return { start, end: start + 86400 };
}
function dayLabel(offset: number, start: number) {
  if (offset === 0) return "Vandaag";
  if (offset === -1) return "Gisteren";
  return new Date(start * 1000).toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" });
}

// HomeWizard-style colors: grid import = purple, grid export = green.
const C = {
  solar: "#f59e0b",
  gridIn: "#a855f7", // drawing from grid (above 0)
  gridOut: "#22c55e", // returning to grid / surplus (below 0)
  battery: "#a855f7", // SOC bars
  batLine: "#6366f1", // battery on the chart (indigo, distinct from grid purple)
  house: "#64748b",
};

function fmtW(w: number | null | undefined) {
  if (w == null) return "—";
  const a = Math.abs(w);
  if (a >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
}

// Net energy (kWh) over a bucketed series: integrate W * dt.
function netKwh(points: { t: number; grid_w: number }[]) {
  if (points.length < 2) return 0;
  const dt = points[1].t - points[0].t;
  return (points.reduce((s, p) => s + (p.grid_w ?? 0), 0) * dt) / 3600 / 1000;
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof Sun;
  label: string;
  value: string;
  sub?: React.ReactNode;
  color: string;
}) {
  return (
    <div className="border-2 border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-4 w-4" style={{ color }} />
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HistPoint }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const time = new Date(d.t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="border border-border bg-popover px-2 py-1 text-[11px] shadow-lg space-y-0.5">
      <div className="font-bold text-muted-foreground">{time}</div>
      <div style={{ color: d.grid_w >= 0 ? C.gridIn : C.gridOut }}>
        Net {d.grid_w >= 0 ? "import " : "export "}{fmtW(Math.abs(d.grid_w))}
      </div>
      <div style={{ color: C.solar }}>Zon {fmtW(d.solar_w)}</div>
      <div style={{ color: C.batLine }}>Batterij {d.bat_w >= 0 ? "ontladen " : "laden "}{fmtW(Math.abs(d.bat_w))}</div>
      <div style={{ color: C.house }}>Verbruik {fmtW(d.house_w)}</div>
    </div>
  );
}

export function EnergyWidget() {
  const [dayOffset, setDayOffset] = useState<number>(0);
  const { start: dayStart, end: dayEnd } = dayWindow(dayOffset);
  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  });
  const { data: hist } = useSWR<{ points: HistPoint[] }>(
    `/api/energy?start=${dayStart}&end=${dayEnd}`,
    fetcher,
    { refreshInterval: dayOffset === 0 ? 30000 : 0, keepPreviousData: true }
  );

  if (live?.error) {
    return (
      <WidgetTile title="Energie" size="xl" className="fa-wide lg:col-span-4 xl:col-span-6">
        <p className="text-[11px] text-[#ff4444]">Monitor: {live.error}</p>
      </WidgetTile>
    );
  }
  if (!live) {
    return (
      <WidgetTile title="Energie" size="xl" className="fa-wide lg:col-span-4 xl:col-span-6">
        <p className="text-[11px] text-muted-foreground">Verbinden met energy-monitor...</p>
      </WidgetTile>
    );
  }

  const charging = live.bat_w < 0;
  const importing = live.grid_w >= 0;
  const points = hist?.points ?? [];
  const socPct = live.soc_avg ?? 0;
  const storedKwh = (live.stored_wh / 1000).toFixed(1);
  const ratedKwh = (live.rated_wh / 1000).toFixed(1);

  // Gradient split point for the net-grid area: above 0 = import (purple),
  // below 0 = export (green) — the HomeWizard look.
  const gridVals = points.map((p) => p.grid_w ?? 0);
  const gMax = Math.max(0, ...gridVals);
  const gMin = Math.min(0, ...gridVals);
  const gridOffset = gMax + Math.abs(gMin) === 0 ? 1 : gMax / (gMax - gMin);
  const dayNet = netKwh(points); // + = imported, - = exported over the day

  return (
    <WidgetTile
      title="Energie"
      size="xl"
      className="lg:col-span-4 xl:col-span-6"
      headerRight={
        <span className="text-[10px] font-mono text-muted-foreground">
          {live.batteries?.[0]?.mode ?? ""} · piek {fmtW(live.grid?.monthly_peak_w)}
        </span>
      }
    >
      <div className="space-y-3">
        {/* Live stats */}
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Stat
            icon={Sun}
            label="Zon"
            value={fmtW(live.solar_w)}
            color={C.solar}
            sub={live.solar?.total_yield_kwh != null ? `${live.solar.total_yield_kwh.toLocaleString("nl-BE")} kWh tot` : undefined}
          />
          <Stat
            icon={importing ? ArrowDownToLine : ArrowUpFromLine}
            label={importing ? "Net import" : "Net export"}
            value={fmtW(Math.abs(live.grid_w))}
            color={importing ? C.gridIn : C.gridOut}
            sub={`tarief T${live.grid?.tariff ?? "?"}`}
          />
          <Stat
            icon={BatteryCharging}
            label={charging ? "Laden" : "Ontladen"}
            value={fmtW(Math.abs(live.bat_w))}
            color={C.battery}
            sub={`${socPct}% · ${storedKwh}/${ratedKwh} kWh`}
          />
          <Stat icon={Home} label="Verbruik" value={fmtW(live.house_w)} color={C.house} />
        </div>

        {/* Battery SOC bars */}
        <div className="space-y-1.5 border-t border-border pt-2">
          {live.batteries.map((b, i) => (
            <div key={b.ip} className="flex items-center gap-2.5">
              <span className="w-14 shrink-0 text-[11px] font-mono text-muted-foreground">Bat {i + 1}</span>
              <div className="relative h-4 flex-1 border border-border bg-muted/30">
                <div
                  className="absolute inset-y-0 left-0 transition-all"
                  style={{ width: `${b.soc ?? 0}%`, background: b.online ? C.battery : "#71717a" }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums">{b.soc ?? "—"}%</span>
              <span className="w-20 shrink-0 text-right text-[11px] font-mono text-muted-foreground">
                {b.online ? (b.power_w < 0 ? "laden " : b.power_w > 0 ? "ontl. " : "idle ") + (b.power_w !== 0 ? fmtW(Math.abs(b.power_w)) : "") : "offline"}
              </span>
            </div>
          ))}
        </div>

        {/* Power chart — per-day view (local midnight to midnight) */}
        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <span className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Net</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: dayNet >= 0 ? C.gridIn : C.gridOut }}>
              {dayNet >= 0 ? "↓ " : "↑ "}
              {Math.abs(dayNet).toFixed(1)} kWh {dayNet >= 0 ? "afname" : "injectie"}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDayOffset((o) => o - 1)}
              className="border-2 border-border p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Vorige dag"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[92px] text-center text-[11px] font-bold tabular-nums">{dayLabel(dayOffset, dayStart)}</span>
            <button
              onClick={() => setDayOffset((o) => Math.min(0, o + 1))}
              disabled={dayOffset >= 0}
              className="border-2 border-border p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              aria-label="Volgende dag"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {points.length > 0 ? (
          <div className="h-72 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                <defs>
                  {/* Split fill/stroke at the zero line: purple above (import), green below (export) */}
                  <linearGradient id="gridFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={gridOffset} stopColor={C.gridIn} stopOpacity={0.55} />
                    <stop offset={gridOffset} stopColor={C.gridOut} stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="gridStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={gridOffset} stopColor={C.gridIn} />
                    <stop offset={gridOffset} stopColor={C.gridOut} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="linear"
                  domain={[dayStart, dayEnd]}
                  ticks={Array.from({ length: 9 }, (_, i) => dayStart + i * 3 * 3600)}
                  tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDataOverflow
                />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
                {/* Hero: net grid power, purple above 0 / green below 0 (HomeWizard style) */}
                <Area
                  type="monotone"
                  dataKey="grid_w"
                  baseValue={0}
                  stroke="url(#gridStroke)"
                  fill="url(#gridFill)"
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
                {/* Solar production (amber) and battery (indigo) as clean lines on top */}
                <Line type="monotone" dataKey="solar_w" stroke={C.solar} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="bat_w" stroke={C.batLine} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="flex h-72 items-center justify-center text-[11px] text-muted-foreground">
            Geen data voor deze dag.
          </p>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <LegendDot color={C.gridIn} label="Net afname" />
          <LegendDot color={C.gridOut} label="Net injectie" />
          <LegendDot color={C.solar} label="Zon" />
          <LegendDot color={C.batLine} label="Batterij" />
        </div>
      </div>
    </WidgetTile>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-1.5 w-3" style={{ background: color }} />
      {label}
    </span>
  );
}
