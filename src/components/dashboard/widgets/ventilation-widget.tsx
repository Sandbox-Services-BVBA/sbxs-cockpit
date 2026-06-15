"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import type { LayoutMode } from "@/lib/widget-registry";
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
  bypass: string; // valve position
  bypass_mode: string; // setpoint: auto|open|closed
  filter: "normal" | "dirty";
  fan_control: "wall" | "modbus";
  fan_mode: string; // holiday|low|normal|high when modbus, else "auto"
  automation?: VentAutomation;
  error?: string;
}

interface VentAutomation {
  enabled: boolean;
  engaged: boolean; // actively pre-cooling now
  status: string;
  reason: string;
  target_c?: number | null;
  forecast?: {
    current_outdoor_c: number | null;
    tomorrow_high_c: number | null;
    dayafter_high_c?: number | null;
  } | null;
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

const BYPASS: { key: string; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Dicht" },
];

function fmt1(n: number | null | undefined) {
  return n == null ? "—" : n.toFixed(1);
}

function Stat({ icon: Icon, label, value, unit, sub, color }: { icon: typeof Wind; label: string; value: string; unit?: string; sub?: string; color: string }) {
  return (
    <div className="border-2 border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-tiny font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-4 w-4" style={{ color }} />
        {label}
      </div>
      <div className="mt-1 font-bold tabular-nums leading-none text-3xl" style={{ color }}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-tiny text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function VentilationWidget({ layout = "grid" }: { layout?: LayoutMode }) {
  // See EnergyWidget: full-width chart, layout-aware width.
  const wideCls =
    layout === "columns"
      ? "ventilation-wide"
      : layout === "wall"
        ? ""
        : "sm:col-span-2 lg:col-span-4 xl:col-span-6 3xl:col-span-8 4xl:col-span-12";
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  const control = async (body: Record<string, string>, key: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fetch("/api/ventilation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      // Defensive: surface a control failure (rare — e.g. a transient bus/comms hiccup).
      if (j && j.ok === false) setMsg(j.error ? `Bediening mislukt: ${j.error}` : "Bediening mislukt");
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  const toggleAuto = async () => {
    setBusy("auto");
    setMsg(null);
    try {
      await fetch("/api/ventilation/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !live?.automation?.enabled }),
      });
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  if (live?.error) {
    return (
      <WidgetTile title="Ventilatie" size="sm" className={wideCls}>
        <p className="text-petite text-[#ff4444]">Monitor: {live.error}</p>
      </WidgetTile>
    );
  }
  if (!live) {
    return (
      <WidgetTile title="Ventilatie" size="sm" className={wideCls}>
        <p className="text-petite text-muted-foreground">Verbinden met ventilation-monitor...</p>
      </WidgetTile>
    );
  }

  const points = hist?.points ?? [];
  const filterDirty = live.filter === "dirty";
  // Which control is active: "wall" -> Auto, else the named modbus preset.
  const activeKey = live.fan_control === "wall" ? "wall" : live.fan_mode;
  const auto = live.automation;
  const autoOn = !!auto?.enabled;

  return (
    <WidgetTile
      title="Ventilatie"
      size="sm"
      className={wideCls}
      headerRight={
        <span className="flex items-center gap-1.5 text-tiny font-mono text-muted-foreground">
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
        <div className="h-44 -mx-1">
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

        {/* Smart cooling automation (forecast-driven) */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-2 px-3 py-2",
            auto?.engaged ? "border-[#06b6d4] bg-[#06b6d4]/10" : autoOn ? "border-[#06b6d4]/50" : "border-border"
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-tiny font-bold uppercase tracking-widest text-muted-foreground">
              <Wind className="h-3.5 w-3.5" style={{ color: "#06b6d4" }} />
              Slimme koeling · voorspelling
            </div>
            <div className="mt-0.5 text-petite truncate">{autoOn ? auto?.reason || auto?.status : "uit — handmatige bediening"}</div>
            {auto?.forecast && (
              <div className="text-mini text-muted-foreground">
                morgen {auto.forecast.tomorrow_high_c ?? "?"}°C · overmorgen {auto.forecast.dayafter_high_c ?? "?"}°C · buiten nu {auto.forecast.current_outdoor_c ?? "?"}°C
              </div>
            )}
          </div>
          <button
            onClick={toggleAuto}
            disabled={busy !== null}
            className={cn(
              "shrink-0 border-2 px-4 py-1.5 text-petite font-bold uppercase tracking-wide transition-colors",
              autoOn ? "border-[#06b6d4] bg-[#06b6d4]/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground",
              busy === "auto" && "opacity-50"
            )}
          >
            {autoOn ? "Aan" : "Uit"}
          </button>
        </div>

        {/* Fan control */}
        <div className={cn("flex items-center gap-2", autoOn && "opacity-40")}>
          <span className="w-16 shrink-0 text-tiny font-bold uppercase tracking-widest text-muted-foreground">Stand</span>
          <div className="grid flex-1 grid-cols-5 gap-1">
            {MODES.map((m) => {
              const key = `fan:${m.key}`;
              return (
                <button
                  key={m.key}
                  disabled={busy !== null || autoOn}
                  onClick={() => control({ mode: m.key }, key)}
                  className={cn(
                    "border-2 px-1 py-1.5 text-tiny font-bold uppercase tracking-wide transition-colors",
                    activeKey === m.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground",
                    busy === key && "opacity-50"
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bypass control */}
        <div className={cn("flex items-center gap-2", autoOn && "opacity-40")}>
          <span className="w-16 shrink-0 text-tiny font-bold uppercase tracking-widest text-muted-foreground">Bypass</span>
          <div className="grid flex-1 grid-cols-3 gap-1">
            {BYPASS.map((bp) => {
              const key = `bypass:${bp.key}`;
              return (
                <button
                  key={bp.key}
                  disabled={busy !== null || autoOn}
                  onClick={() => control({ bypass: bp.key }, key)}
                  className={cn(
                    "border-2 px-1 py-1.5 text-tiny font-bold uppercase tracking-wide transition-colors",
                    live.bypass_mode === bp.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground",
                    busy === key && "opacity-50"
                  )}
                >
                  {bp.label}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-mini text-muted-foreground">
          {autoOn
            ? "Slimme koeling stuurt nu automatisch (stand + doeltemperatuur o.b.v. de weersvoorspelling). Zet uit voor handmatige bediening."
            : "Stand-Auto = klokprogramma. Een stand of bypass kiezen neemt Modbus-controle over (bypass normaal op Auto = vrije koeling). Slimme koeling = automatisch voorkoelen als het morgen warm wordt."}
        </p>
        {msg && <p className="text-mini text-[#ff4444]">{msg}</p>}
      </div>
    </WidgetTile>
  );
}
