"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { Sun, Zap, Home, ChevronLeft, ChevronRight } from "lucide-react";
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
  power_w: number; // + discharge, - charge
  temp_c: number | null;
  capacity_wh: number | null;
  rated_wh: number;
  mode: string | null;
}
interface Live {
  ts: number;
  grid_w: number; // + import (usage), - export (injection)
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

// One fixed color per metric (matches the boxes, never flips). The sign of the
// value tells the direction; position above/below zero on the chart matches.
//   Usage (grid): + = afname (drawing from grid), - = injection. Never labelled "injection".
//   Battery: + = charging (filling), - = discharging.
const C = {
  solar: "#f59e0b", // amber
  usage: "#ef4444", // red — grid afname (drawing from grid, zero or above)
  gridPink: "#ec4899", // pink — grid injection (below zero)
  battery: "#06b6d4", // blue — battery
  house: "#64748b", // slate — house consumption
};

// Grid color: red when drawing from the grid (>= 0, afname), pink when
// injecting (< 0). Hard split at zero — no gradient, no in-between color.
function gridColor(w: number) {
  return w >= 0 ? C.usage : C.gridPink;
}

const REFRESH_MS = 3000; // live refresh cadence (matches the 3s service poll)

type MetricKey = "solar" | "usage" | "bat" | "house";
const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "solar", label: "Zon", color: C.solar },
  { key: "usage", label: "Grid", color: C.usage },
  { key: "bat", label: "Batterij", color: C.battery },
  { key: "house", label: "Verbruik", color: C.house },
];

function fmtW(w: number | null | undefined) {
  if (w == null) return "—";
  const a = Math.abs(w);
  if (a >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
}
// Signed value — direction lives in the sign, so no word ever flips.
function fmtSigned(w: number | null | undefined) {
  if (w == null) return "—";
  if (Math.round(w) === 0) return "0 W";
  return (w > 0 ? "+" : "−") + fmtW(Math.abs(w));
}

// Net grid energy (kWh) over the day: integrate W·dt. + = net afname.
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

// Vertical battery that fills from the bottom; animated packets when charging
// (green, rising) / discharging (amber, falling); still when idle.
function VerticalBattery({ index, soc, power, online }: { index: number; soc: number | null; power: number; online: boolean }) {
  const charging = online && power < 0; // power: + discharge, - charge
  const discharging = online && power > 0;
  const pct = Math.max(0, Math.min(100, soc ?? 0));
  const state = !online ? "offline" : charging ? "laden" : discharging ? "ontladen" : "idle";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-col items-center">
        <div className="h-1.5 w-5 bg-border" />
        <div className="relative h-20 w-11 overflow-hidden border-2 border-border bg-muted/30">
          <div
            className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out", charging && "batt-glow")}
            style={{ height: `${pct}%`, background: online ? C.battery : "#71717a" }}
          />
          {(charging || discharging) &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="batt-packet absolute bottom-1 h-1.5 w-1.5"
                style={{
                  left: `${20 + i * 26}%`,
                  background: charging ? "rgba(34,197,94,0.9)" : "rgba(245,158,11,0.9)",
                  animationName: charging ? "batt-rise" : "batt-fall",
                  animationDuration: `${1.9 + i * 0.3}s`,
                  animationDelay: `${i * 0.45}s`,
                }}
              />
            ))}
        </div>
      </div>
      <div className="text-center leading-tight">
        <div className="text-[10px] font-mono text-muted-foreground">Bat {index}</div>
        <div className="text-sm font-bold tabular-nums">{soc ?? "—"}%</div>
        <div className="text-[10px] font-mono" style={{ color: charging || discharging ? C.battery : undefined }}>
          {state}
          {online && power !== 0 ? ` ${fmtW(Math.abs(power))}` : ""}
        </div>
      </div>
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
      <div style={{ color: C.solar }}>Zon {fmtW(d.solar_w)}</div>
      <div style={{ color: gridColor(d.grid_w) }}>Grid {fmtSigned(d.grid_w)}</div>
      <div style={{ color: C.battery }}>Batterij {fmtSigned(d.bat_w == null ? null : -d.bat_w)}</div>
      <div style={{ color: C.house }}>Verbruik {fmtW(d.house_w)}</div>
    </div>
  );
}

export function EnergyWidget() {
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [show, setShow] = useState<Record<MetricKey, boolean>>({ solar: true, usage: true, bat: true, house: true });
  const [tick, setTick] = useState(0); // bumps on each live refresh → restarts countdown
  const { start: dayStart, end: dayEnd } = dayWindow(dayOffset);
  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });
  const { data: hist } = useSWR<{ points: HistPoint[] }>(
    `/api/energy?start=${dayStart}&end=${dayEnd}`,
    fetcher,
    { refreshInterval: dayOffset === 0 ? 10000 : 0, keepPreviousData: true }
  );

  if (live?.error) {
    return (
      <WidgetTile title="Energie" size="xl" className="energy-wide lg:col-span-4 xl:col-span-6">
        <p className="text-[11px] text-[#ff4444]">Monitor: {live.error}</p>
      </WidgetTile>
    );
  }
  if (!live) {
    return (
      <WidgetTile title="Energie" size="xl" className="energy-wide lg:col-span-4 xl:col-span-6">
        <p className="text-[11px] text-muted-foreground">Verbinden met energy-monitor...</p>
      </WidgetTile>
    );
  }

  const points = hist?.points ?? [];
  const socPct = live.soc_avg ?? 0;
  const storedKwh = (live.stored_wh / 1000).toFixed(1);
  const ratedKwh = (live.rated_wh / 1000).toFixed(1);

  // Chart series. usage = grid_w raw (afname up / injection down).
  // bat = -bat_w (charging up / discharging down).
  const chartData = points.map((p) => ({
    ...p,
    usage: p.grid_w,
    bat: p.bat_w == null ? null : -p.bat_w,
  }));
  const dayNet = netKwh(points); // + = net afname over the day

  // Vertical gradient for the Grid line: red (afname, top) -> orange (light
  // injection) -> pink (deep injection, below -1 kW). Offsets map to the y-domain.
  const gVals = chartData.map((p) => p.usage).filter((v): v is number => v != null);
  const gMax = Math.max(0, ...gVals, 10);
  const gMin = Math.min(0, ...gVals, -10);
  const gRange = gMax - gMin;
  const goff = (v: number) => Math.min(1, Math.max(0, (gMax - v) / gRange));

  const toggle = (k: MetricKey) => setShow((s) => ({ ...s, [k]: !s[k] }));

  return (
    <WidgetTile
      title="Energie"
      size="xl"
      className="energy-wide lg:col-span-4 xl:col-span-6"
      headerRight={
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <span
            key={tick}
            className="inline-block h-2 w-2"
            style={{ background: "#22c55e", animation: `energy-heartbeat ${REFRESH_MS}ms ease-out forwards` }}
          />
          live · {live.batteries?.[0]?.mode ?? ""} · piek {fmtW(live.grid?.monthly_peak_w)}
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
            icon={Zap}
            label="Grid"
            value={fmtSigned(live.grid_w)}
            color={gridColor(live.grid_w)}
            sub={`+ = afname · − = injectie · T${live.grid?.tariff ?? "?"}`}
          />
          <Stat icon={Home} label="Verbruik" value={fmtW(live.house_w)} color={C.house} />
          <div className="flex items-center justify-center gap-5 border-2 border-border px-2 py-1">
            {live.batteries.map((b, i) => (
              <VerticalBattery key={b.ip} index={i + 1} soc={b.soc} power={b.power_w} online={b.online} />
            ))}
          </div>
        </div>

        {/* Battery summary line */}
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          <span>
            Batterij <span className="font-bold" style={{ color: C.battery }}>{socPct}%</span> · {storedKwh}/{ratedKwh} kWh opgeslagen
          </span>
          <span className="font-mono" style={{ color: C.battery }}>
            {live.bat_w < 0 ? "laden" : live.bat_w > 0 ? "ontladen" : "idle"} {live.bat_w !== 0 ? fmtW(Math.abs(live.bat_w)) : ""}
          </span>
        </div>

        {/* Chart header: day net + day navigation */}
        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <span className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Grid vandaag</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: gridColor(dayNet * 1000) }}>
              {dayNet >= 0 ? "+" : "−"}
              {Math.abs(dayNet).toFixed(1)} kWh
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

        {/* Metric toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className={cn(
                "flex items-center gap-1.5 border-2 px-2 py-0.5 text-[10px] font-bold transition-opacity",
                show[m.key] ? "border-border" : "border-border opacity-35"
              )}
            >
              <span className="inline-block h-2 w-3" style={{ background: m.color }} />
              {m.label}
            </button>
          ))}
          <span className="ml-auto text-[9px] italic text-muted-foreground">boven 0 = afname/laden/opwekken · onder 0 = injectie/ontladen</span>
        </div>

        {chartData.length > 0 ? (
          <div className="h-96 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.solar} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={C.solar} stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gridGrad" x1="0" y1="0" x2="0" y2="1">
                    {/* hard split at the zero line: red above (afname), pink below (injection) */}
                    <stop offset={goff(0)} stopColor={C.usage} />
                    <stop offset={goff(0)} stopColor={C.gridPink} />
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
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                {show.solar && (
                  <Area type="linear" dataKey="solar_w" stroke={C.solar} fill="url(#solarFill)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                )}
                {show.house && (
                  <Line type="linear" dataKey="house_w" stroke={C.house} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
                )}
                {show.usage && (
                  <Line type="linear" dataKey="usage" stroke="url(#gridGrad)" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls />
                )}
                {show.bat && (
                  <Line type="linear" dataKey="bat" stroke={C.battery} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="flex h-96 items-center justify-center text-[11px] text-muted-foreground">Geen data voor deze dag.</p>
        )}
      </div>
    </WidgetTile>
  );
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
