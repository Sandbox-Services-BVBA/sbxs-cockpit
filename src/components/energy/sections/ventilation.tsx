"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Wind, Thermometer, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Section, Metric, LivePulse } from "../ui";
import { cn } from "@/lib/utils";

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
  bypass_mode: string;
  filter: "normal" | "dirty";
  fan_control: "wall" | "modbus";
  fan_mode: string;
  automation?: VentAutomation;
  error?: string;
}
interface VentAutomation {
  enabled: boolean;
  engaged: boolean;
  status: string;
  reason: string;
  target_c?: number | null;
  forecast?: { current_outdoor_c: number | null; tomorrow_high_c: number | null; dayafter_high_c?: number | null } | null;
}
interface VentPoint {
  t: number;
  supply_temp: number;
  extract_temp: number;
  supply_airflow: number;
  extract_airflow: number;
}

const C = { supply: "#06b6d4", extract: "#f59e0b", airflow: "#22c55e" };
const REFRESH_MS = 10000;
const HIST_WIN = 6 * 3600;

const MODES = [
  { key: "wall", label: "Auto" },
  { key: "low", label: "Laag" },
  { key: "normal", label: "Normaal" },
  { key: "high", label: "Hoog" },
  { key: "holiday", label: "Vakantie" },
];
const BYPASS = [
  { key: "auto", label: "Auto" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Dicht" },
];

const fmt1 = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const bypassActive = (b: string | undefined) => b === "open" || b === "opening";

export function Ventilation() {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: live, mutate } = useSWR<VentLive>("/api/ventilation", fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });
  const now = useMemo(() => Math.floor(Date.now() / 1000), [tick]);
  const { data: hist } = useSWR<{ points: VentPoint[] }>(`/api/ventilation?start=${now - HIST_WIN}&end=${now}`, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
  });

  const control = async (body: Record<string, string>, key: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fetch("/api/ventilation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
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
      await fetch("/api/ventilation/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !live?.automation?.enabled }) });
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  if (live?.error) {
    return (
      <Section title="Ventilatie" icon={Wind}>
        <p className="text-petite text-[#ff4444]">Monitor: {live.error}</p>
      </Section>
    );
  }
  if (!live) {
    return (
      <Section title="Ventilatie" icon={Wind}>
        <p className="text-petite text-muted-foreground">Verbinden met ventilation-monitor...</p>
      </Section>
    );
  }

  const points = hist?.points ?? [];
  const filterDirty = live.filter === "dirty";
  const bypassOpen = bypassActive(live.bypass);
  const activeKey = live.fan_control === "wall" ? "wall" : live.fan_mode;
  const auto = live.automation;
  const autoOn = !!auto?.enabled;

  return (
    <Section
      title="Ventilatie — sturing"
      icon={Wind}
      right={<LivePulse intervalMs={REFRESH_MS} tick={tick} label={`${live.fan_control === "wall" ? "klok" : "modbus"} · bypass ${live.bypass}`} />}
    >
      <div className="space-y-4">
        {/* Live readings */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric icon={ArrowDownToLine} label="Inblaas" value={fmt1(live.supply_temp_c)} unit="°C" color={C.supply} sub={`naar woning · ${live.supply_airflow_m3h} m³/h`} />
          <Metric icon={ArrowUpFromLine} label="Retour" value={fmt1(live.extract_temp_c)} unit="°C" color={C.extract} sub={`uit woning · ${live.extract_airflow_m3h} m³/h`} />
          <Metric icon={Wind} label="Debiet" value={`${live.supply_airflow_m3h}`} unit="m³/h" color={C.airflow} sub={`retour ${live.extract_airflow_m3h}`} />
          <Metric
            icon={Thermometer}
            label="Filter"
            value={filterDirty ? "Vuil" : "OK"}
            color={filterDirty ? "#ef4444" : bypassOpen ? "#06b6d4" : "#22c55e"}
            sub={bypassOpen ? "bypass open · vrije koeling" : `bypass ${live.bypass}`}
          />
        </div>

        {/* Temp + airflow history */}
        <div className="h-48 -mx-1 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis yAxisId="t" orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={30} domain={["auto", "auto"]} tickLine={false} axisLine={false} />
              <YAxis yAxisId="f" orientation="left" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} width={28} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }} labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleTimeString("nl-BE")} />
              <Area yAxisId="f" type="monotone" dataKey="supply_airflow" name="debiet" stroke={C.airflow} fill={C.airflow} fillOpacity={0.12} strokeWidth={1} dot={false} connectNulls />
              <Line yAxisId="t" type="monotone" dataKey="supply_temp" name="inblaas °C" stroke={C.supply} strokeWidth={1.8} dot={false} connectNulls />
              <Line yAxisId="t" type="monotone" dataKey="extract_temp" name="retour °C" stroke={C.extract} strokeWidth={1.8} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Smart cooling automation */}
        <div className={cn("flex items-center justify-between gap-3 border-2 px-3 py-2.5", auto?.engaged ? "border-[#06b6d4] bg-[#06b6d4]/10" : autoOn ? "border-[#06b6d4]/50" : "border-border")}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-tiny font-bold uppercase tracking-widest text-muted-foreground">
              <Wind className="h-3.5 w-3.5" style={{ color: "#06b6d4" }} />
              Slimme koeling · voorspelling
            </div>
            <div className="mt-0.5 truncate text-petite">{autoOn ? auto?.reason || auto?.status : "uit — handmatige bediening"}</div>
            {auto?.forecast && (
              <div className="text-mini text-muted-foreground">
                morgen {auto.forecast.tomorrow_high_c ?? "?"}°C · overmorgen {auto.forecast.dayafter_high_c ?? "?"}°C · buiten nu {auto.forecast.current_outdoor_c ?? "?"}°C
              </div>
            )}
          </div>
          <button
            onClick={toggleAuto}
            disabled={busy !== null}
            className={cn("shrink-0 border-2 px-5 py-2 text-petite font-bold uppercase tracking-wide transition-colors", autoOn ? "border-[#06b6d4] bg-[#06b6d4]/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground", busy === "auto" && "opacity-50")}
          >
            {autoOn ? "Aan" : "Uit"}
          </button>
        </div>

        {/* Fan + bypass controls */}
        <div className={cn("space-y-3", autoOn && "opacity-40")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-20 shrink-0 text-tiny font-bold uppercase tracking-widest text-muted-foreground">Stand</span>
            <div className="grid flex-1 grid-cols-5 gap-1.5">
              {MODES.map((m) => {
                const key = `fan:${m.key}`;
                return (
                  <button
                    key={m.key}
                    disabled={busy !== null || autoOn}
                    onClick={() => control({ mode: m.key }, key)}
                    className={cn("border-2 px-1 py-2 text-tiny font-bold uppercase tracking-wide transition-colors", activeKey === m.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground", busy === key && "opacity-50")}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-20 shrink-0 text-tiny font-bold uppercase tracking-widest text-muted-foreground">Bypass</span>
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {BYPASS.map((bp) => {
                const key = `bypass:${bp.key}`;
                return (
                  <button
                    key={bp.key}
                    disabled={busy !== null || autoOn}
                    onClick={() => control({ bypass: bp.key }, key)}
                    className={cn("border-2 px-1 py-2 text-tiny font-bold uppercase tracking-wide transition-colors", live.bypass_mode === bp.key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground", busy === key && "opacity-50")}
                  >
                    {bp.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-mini text-muted-foreground">
          Inblaas = verse lucht die de woning ingeblazen wordt (na warmteterugwinning). Retour = lucht die uit de woning afgezogen wordt (≈ binnentemperatuur).
          {autoOn
            ? " Slimme koeling stuurt nu automatisch. Zet uit voor handmatige bediening."
            : " Stand-Auto = klokprogramma. Een stand of bypass kiezen neemt Modbus-controle over."}
        </p>
        {msg && <p className="text-mini text-[#ff4444]">{msg}</p>}
      </div>
    </Section>
  );
}
