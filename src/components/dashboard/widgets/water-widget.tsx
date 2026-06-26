"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import type { LayoutMode } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";
import { Droplet } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WaterPoint {
  d: string; // YYYY-MM-DD (local)
  m3: number; // consumption that day
  liter: number;
  eur: number;
}
interface WaterData {
  days: number;
  unit: string;
  price_eur_per_m3: number;
  current_m3: number | null; // cumulative meter reading
  current_ts: number | null;
  flow_lpm: number | null; // live flow
  points: WaterPoint[];
  error?: string;
}

// Water moves slowly; poll lazily but often enough to catch a live tap (flow).
const REFRESH_MS = 30000;
const WATER_COLOR = "#3b82f6"; // blue droplet (matches HomeWizard water hue)

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

function wideCls(layout: LayoutMode) {
  return layout === "columns"
    ? "energy-wide"
    : layout === "wall"
      ? ""
      : "sm:col-span-2 lg:col-span-4 xl:col-span-6 3xl:col-span-8 4xl:col-span-12";
}

function fmt(n: number, d = 1) {
  return n.toLocaleString("nl-BE", { minimumFractionDigits: d, maximumFractionDigits: d });
}
// Litres for small amounts, m³ once it gets large.
function fmtVol(liter: number) {
  if (liter >= 1000) return `${fmt(liter / 1000, 2)} m³`;
  return `${fmt(liter, 0)} L`;
}

interface TooltipEntry {
  payload?: WaterPoint;
}
function WaterTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const date = new Date(p.d).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" });
  return (
    <div className="border border-border bg-popover px-2 py-1 text-petite shadow-lg space-y-0.5">
      <div className="font-bold text-muted-foreground">{date}</div>
      <div className="flex items-center gap-2" style={{ color: WATER_COLOR }}>
        <span className="inline-block h-1.5 w-3" style={{ background: WATER_COLOR }} />
        <span className="flex-1">Water</span>
        <span className="font-bold tabular-nums">{fmt(p.liter, 0)} L</span>
      </div>
      <div className="text-muted-foreground tabular-nums">
        {fmt(p.m3, 3)} m³ · € {fmt(p.eur, 2)}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="border-2 border-border px-3 py-2.5">
      <div className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-bold tabular-nums leading-none text-3xl" style={{ color: WATER_COLOR }}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-tiny text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function WaterWidget({ layout = "grid" }: { layout?: LayoutMode }) {
  const [days, setDays] = useState<number>(30);
  const { data } = useSWR<WaterData>(`/api/energy?water=1&days=${days}`, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
  });

  const cls = wideCls(layout);

  if (data?.error) {
    return (
      <WidgetTile title="Water" size="sm" className={cls}>
        <p className="text-petite text-[#ff4444]">Monitor: {data.error}</p>
      </WidgetTile>
    );
  }
  if (!data) {
    return (
      <WidgetTile title="Water" size="sm" className={cls}>
        <p className="text-petite text-muted-foreground">Verbinden met energy-monitor...</p>
      </WidgetTile>
    );
  }

  const points = data.points ?? [];
  const today = points.length ? points[points.length - 1] : null;
  const totalLiter = points.reduce((s, p) => s + p.liter, 0);
  const totalEur = points.reduce((s, p) => s + p.eur, 0);
  const usedDays = points.filter((p) => p.liter > 0).length || 1;
  const avgLiter = totalLiter / usedDays;
  const flowing = (data.flow_lpm ?? 0) > 0;

  const xTickFmt = (d: string) =>
    new Date(d).toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit" });

  return (
    <WidgetTile
      title="Water"
      size="sm"
      className={cls}
      headerRight={
        <span className="flex items-center gap-1.5 text-tiny font-mono text-muted-foreground">
          <Droplet className={cn("h-3.5 w-3.5", flowing && "animate-pulse")} style={{ color: WATER_COLOR }} />
          {flowing ? `${fmt(data.flow_lpm ?? 0, 1)} l/min` : `meterstand ${data.current_m3 != null ? `${fmt(data.current_m3, 3)} m³` : "—"}`}
        </span>
      }
    >
      <div className="space-y-2">
        {/* Range selector — same pattern as the gas/energy widgets */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex">
            {RANGES.map((r, i) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  "border-2 px-2.5 py-0.5 text-tiny font-bold uppercase tracking-wide transition-colors",
                  i > 0 && "border-l-0",
                  days === r.days
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Stat label="Vandaag" value={today ? fmt(today.liter, 0) : "—"} unit="L" sub={today ? `€ ${fmt(today.eur, 2)}` : undefined} />
          <Stat label="Gem./dag" value={fmt(avgLiter, 0)} unit="L" sub={`${fmt(avgLiter / 1000, 3)} m³`} />
          <Stat label={`Totaal ${days}d`} value={fmtVol(totalLiter)} sub={`${fmt(totalLiter / 1000, 2)} m³`} />
          <Stat label={`Kost ${days}d`} value={`€ ${fmt(totalEur, 2)}`} sub={`${fmt(data.price_eur_per_m3, 2)} €/m³`} />
        </div>

        {/* Daily consumption bars (litres) */}
        <div className="h-56 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="d"
                tickFormatter={xTickFmt}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                orientation="right"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip content={<WaterTooltip />} cursor={{ fill: "var(--border)", fillOpacity: 0.3 }} />
              <Bar dataKey="liter" name="L" fill={WATER_COLOR} isAnimationActive={false} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-mini text-muted-foreground">
          Dagverbruik water (liter) uit de HomeWizard watermeter. € indicatief: {fmt(data.price_eur_per_m3, 2)} €/m³ (afgeleid uit de
          afrekening van De Watergroep, EUR 485,46 / 101 m³). Bijstellen zodra de PDF-detailprijs binnen is.
        </p>
      </div>
    </WidgetTile>
  );
}
