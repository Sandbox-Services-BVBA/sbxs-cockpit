"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import type { LayoutMode } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";
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

interface GasPoint {
  d: string; // YYYY-MM-DD (local)
  m3: number; // consumption that day
  kwh: number;
  eur: number;
}
interface GasData {
  days: number;
  unit: string;
  kwh_per_m3: number;
  price_ct_per_kwh: number;
  current_m3: number | null; // cumulative meter reading
  current_ts: number | null;
  points: GasPoint[];
  error?: string;
}

// Gas moves slowly (P1 updates the gas register ~every 5 min); poll lazily.
const REFRESH_MS = 60000;
const GAS_COLOR = "#f97316"; // orange flame

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

interface TooltipEntry {
  payload?: GasPoint;
}
function GasTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const date = new Date(p.d).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" });
  return (
    <div className="border border-border bg-popover px-2 py-1 text-petite shadow-lg space-y-0.5">
      <div className="font-bold text-muted-foreground">{date}</div>
      <div className="flex items-center gap-2" style={{ color: GAS_COLOR }}>
        <span className="inline-block h-1.5 w-3" style={{ background: GAS_COLOR }} />
        <span className="flex-1">Gas</span>
        <span className="font-bold tabular-nums">{fmt(p.m3, 2)} m³</span>
      </div>
      <div className="text-muted-foreground tabular-nums">
        {fmt(p.kwh, 0)} kWh · € {fmt(p.eur, 2)}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="border-2 border-border px-3 py-2.5">
      <div className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-bold tabular-nums leading-none text-3xl" style={{ color: GAS_COLOR }}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-tiny text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function GasWidget({ layout = "grid" }: { layout?: LayoutMode }) {
  const [days, setDays] = useState<number>(30);
  const { data } = useSWR<GasData>(`/api/energy?gas=1&days=${days}`, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
  });

  const cls = wideCls(layout);

  if (data?.error) {
    return (
      <WidgetTile title="Gas" size="sm" className={cls}>
        <p className="text-petite text-[#ff4444]">Monitor: {data.error}</p>
      </WidgetTile>
    );
  }
  if (!data) {
    return (
      <WidgetTile title="Gas" size="sm" className={cls}>
        <p className="text-petite text-muted-foreground">Verbinden met energy-monitor...</p>
      </WidgetTile>
    );
  }

  const points = data.points ?? [];
  const today = points.length ? points[points.length - 1] : null;
  const totalM3 = points.reduce((s, p) => s + p.m3, 0);
  const totalEur = points.reduce((s, p) => s + p.eur, 0);
  // Average over days that actually recorded usage (ignore an empty leading day).
  const usedDays = points.filter((p) => p.m3 > 0).length || 1;
  const avgM3 = totalM3 / usedDays;

  const xTickFmt = (d: string) =>
    new Date(d).toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit" });

  return (
    <WidgetTile
      title="Gas"
      size="sm"
      className={cls}
      headerRight={
        <span className="flex items-center gap-1.5 text-tiny font-mono text-muted-foreground">
          <Flame className="h-3.5 w-3.5" style={{ color: GAS_COLOR }} />
          meterstand {data.current_m3 != null ? `${fmt(data.current_m3, 1)} m³` : "—"}
        </span>
      }
    >
      <div className="space-y-2">
        {/* Range selector — same pattern as the energy/climate widgets */}
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
          <Stat label="Vandaag" value={today ? fmt(today.m3, 2) : "—"} unit="m³" sub={today ? `€ ${fmt(today.eur, 2)}` : undefined} />
          <Stat label="Gem./dag" value={fmt(avgM3, 2)} unit="m³" sub={`${fmt(avgM3 * data.kwh_per_m3, 0)} kWh`} />
          <Stat label={`Totaal ${days}d`} value={fmt(totalM3, 1)} unit="m³" sub={`${fmt(totalM3 * data.kwh_per_m3, 0)} kWh`} />
          <Stat label={`Kost ${days}d`} value={`€ ${fmt(totalEur, 0)}`} sub={`${data.price_ct_per_kwh} ct/kWh`} />
        </div>

        {/* Daily consumption bars */}
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
              <Tooltip content={<GasTooltip />} cursor={{ fill: "var(--border)", fillOpacity: 0.3 }} />
              <Bar dataKey="m3" name="m³" fill={GAS_COLOR} isAnimationActive={false} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-mini text-muted-foreground">
          Dagverbruik gas (m³) uit de P1-meter. kWh en € indicatief: {data.kwh_per_m3} kWh/m³ · {data.price_ct_per_kwh} ct/kWh.
          Straks de hefboom om in de winter op zonnige dagen elektrisch (uit de batterijen) te verwarmen i.p.v. gas.
        </p>
      </div>
    </WidgetTile>
  );
}
