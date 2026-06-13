"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { Sun, Zap, BatteryCharging, Home, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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

const PERIODS = [
  { key: 1, label: "1H" },
  { key: 6, label: "6H" },
  { key: 24, label: "24H" },
  { key: 72, label: "3D" },
] as const;

const C = {
  solar: "#f59e0b",
  grid: "#38bdf8",
  battery: "#a855f7",
  house: "#e5e7eb",
  soc: "#22c55e",
};

function fmtW(w: number | null | undefined) {
  if (w == null) return "—";
  const a = Math.abs(w);
  if (a >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
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
    <div className="border border-border bg-popover px-2 py-1 text-[10px] shadow-lg space-y-0.5">
      <div className="font-bold text-muted-foreground">{time}</div>
      <div style={{ color: C.solar }}>Zon {fmtW(d.solar_w)}</div>
      <div style={{ color: C.house }}>Verbruik {fmtW(d.house_w)}</div>
      <div style={{ color: C.battery }}>Batterij {d.bat_w >= 0 ? "ontladen " : "laden "}{fmtW(Math.abs(d.bat_w))}</div>
      <div style={{ color: C.grid }}>Net {d.grid_w >= 0 ? "import " : "export "}{fmtW(Math.abs(d.grid_w))}</div>
    </div>
  );
}

export function EnergyWidget() {
  const [hours, setHours] = useState<number>(6);
  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  });
  const { data: hist } = useSWR<{ points: HistPoint[] }>(`/api/energy?hours=${hours}`, fetcher, {
    refreshInterval: 30000,
    keepPreviousData: true,
  });

  if (live?.error) {
    return (
      <WidgetTile title="Energie" size="xl" className="lg:col-span-4 xl:col-span-6">
        <p className="text-[11px] text-[#ff4444]">Monitor: {live.error}</p>
      </WidgetTile>
    );
  }
  if (!live) {
    return (
      <WidgetTile title="Energie" size="xl" className="lg:col-span-4 xl:col-span-6">
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
            color={importing ? "#ef4444" : C.soc}
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

        {/* Power chart */}
        <div className="flex items-center justify-between border-t border-border pt-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vermogen</span>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setHours(p.key)}
                className={cn(
                  "border-2 px-2.5 py-1 text-[10px] font-bold transition-colors",
                  hours === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {points.length > 1 ? (
          <div className="h-72 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}
                  tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis tick={{ fontSize: 8, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
                <Area type="monotone" dataKey="solar_w" stroke={C.solar} fill={C.solar} fillOpacity={0.18} strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="bat_w" stroke={C.battery} fill={C.battery} fillOpacity={0.12} strokeWidth={1.2} dot={false} />
                <Line type="monotone" dataKey="grid_w" stroke={C.grid} strokeWidth={1.2} dot={false} />
                <Line type="monotone" dataKey="house_w" stroke={C.house} strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="flex h-72 items-center justify-center text-[11px] text-muted-foreground">
            Grafiek vult zich... (elke 15s een meetpunt)
          </p>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground">
          <LegendDot color={C.solar} label="Zon" />
          <LegendDot color={C.house} label="Verbruik" />
          <LegendDot color={C.battery} label="Batterij" />
          <LegendDot color={C.grid} label="Net" />
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
