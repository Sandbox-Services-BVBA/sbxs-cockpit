"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { Wind, Thermometer, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface VentLive {
  ts: number;
  supply_temp_c: number;
  extract_temp_c: number;
  supply_airflow_m3h: number;
  extract_airflow_m3h: number;
  supply_pressure_pa: number;
  extract_pressure_pa: number;
  bypass: string;
  filter: "normal" | "dirty";
  fan_control: "wall" | "modbus";
  fan_mode: string; // holiday|low|normal|high when modbus, else "auto"
  error?: string;
}

interface VentPoint {
  t: number;
  supply_temp: number;
  extract_temp: number;
  supply_airflow: number;
  extract_airflow: number;
}

const C = {
  supply: "#06b6d4", // cyan — incoming/fresh
  extract: "#f59e0b", // amber — outgoing/stale
  airflow: "#22c55e",
};

const REFRESH_MS = 10000;
const HIST_WIN = 6 * 3600; // last 6h

// Buttons map a label to the mode the control endpoint expects.
const MODES: { key: string; label: string }[] = [
  { key: "wall", label: "Auto" },
  { key: "low", label: "Laag" },
  { key: "normal", label: "Normaal" },
  { key: "high", label: "Hoog" },
  { key: "holiday", label: "Vakantie" },
];

function fmt1(n: number | null | undefined) {
  return n == null ? "—" : n.toFixed(1);
}

function Stat({ icon: Icon, label, value, unit, sub, color }: { icon: typeof Wind; label: string; value: string; unit?: string; sub?: string; color: string }) {
  return (
    <div className="border-2 border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-4 w-4" style={{ color }} />
        {label}
      </div>
      <div className="mt-1 font-bold tabular-nums leading-none text-3xl" style={{ color }}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function VentilationWidget() {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: live, mutate } = useSWR<VentLive>("/api/ventilation", fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });

  const now = useMemo(() => Math.floor(Date.now() / 1000), [tick]);
  const { data: hist } = useSWR<{ points: VentPoint[] }>(
    `/api/ventilation?start=${now - HIST_WIN}&end=${now}`,
    fetcher,
    { refreshInterval: REFRESH_MS, keepPreviousData: true }
  );

  const setMode = async (mode: string) => {
    setBusy(mode);
    try {
      await fetch("/api/ventilation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  if (live?.error) {
    return (
      <WidgetTile title="Ventilatie" size="lg">
        <p className="text-[11px] text-[#ff4444]">Monitor: {live.error}</p>
      </WidgetTile>
    );
  }
  if (!live) {
    return (
      <WidgetTile title="Ventilatie" size="lg">
        <p className="text-[11px] text-muted-foreground">Verbinden met ventilation-monitor...</p>
      </WidgetTile>
    );
  }

  const points = hist?.points ?? [];
  const filterDirty = live.filter === "dirty";
  // Which control is active: "wall" -> Auto, else the named modbus preset.
  const activeKey = live.fan_control === "wall" ? "wall" : live.fan_mode;

  return (
    <WidgetTile
      title="Ventilatie"
      size="lg"
      headerRight={
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <span key={tick} className="inline-block h-2 w-2" style={{ background: "#22c55e", animation: `energy-heartbeat ${REFRESH_MS}ms ease-out forwards` }} />
          live · {live.fan_control === "wall" ? "klok" : "modbus"} · bypass {live.bypass}
        </span>
      }
    >
      <div className="space-y-2">
        {/* Live stats */}
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Stat icon={ArrowDownToLine} label="Toevoer" value={fmt1(live.supply_temp_c)} unit="°C" sub={`${live.supply_airflow_m3h} m³/h`} color={C.supply} />
          <Stat icon={ArrowUpFromLine} label="Afvoer" value={fmt1(live.extract_temp_c)} unit="°C" sub={`${live.extract_airflow_m3h} m³/h`} color={C.extract} />
          <Stat icon={Wind} label="Debiet" value={`${live.supply_airflow_m3h}`} unit="m³/h" sub={`afvoer ${live.extract_airflow_m3h}`} color={C.airflow} />
          <Stat
            icon={Thermometer}
            label="Filter"
            value={filterDirty ? "Vuil" : "OK"}
            sub={`bypass ${live.bypass}`}
            color={filterDirty ? "#ef4444" : "#22c55e"}
          />
        </div>

        {/* Temp + airflow history */}
        <div className="h-28 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })} />
              <YAxis yAxisId="t" orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={30} domain={["auto", "auto"]} />
              <YAxis yAxisId="f" orientation="left" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={28} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }}
                labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleTimeString("nl-BE")}
              />
              <Area yAxisId="f" type="monotone" dataKey="supply_airflow" name="debiet" stroke={C.airflow} fill={C.airflow} fillOpacity={0.12} strokeWidth={1} dot={false} connectNulls />
              <Line yAxisId="t" type="monotone" dataKey="supply_temp" name="toevoer °C" stroke={C.supply} strokeWidth={1.8} dot={false} connectNulls />
              <Line yAxisId="t" type="monotone" dataKey="extract_temp" name="afvoer °C" stroke={C.extract} strokeWidth={1.8} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Fan control */}
        <div className="grid grid-cols-5 gap-1">
          {MODES.map((m) => {
            const isActive = activeKey === m.key;
            return (
              <button
                key={m.key}
                disabled={busy !== null}
                onClick={() => setMode(m.key)}
                className={cn(
                  "border-2 px-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
                  isActive ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground",
                  busy === m.key && "opacity-50"
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-muted-foreground">
          Auto = klokprogramma (wandbediening). Een stand kiezen neemt Modbus-controle over; dit kan ~6s duren.
        </p>
      </div>
    </WidgetTile>
  );
}
