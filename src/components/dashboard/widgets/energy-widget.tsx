"use client";

import { useState, useEffect, useMemo } from "react";
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
  grid_w: number; // + afname (import), - injectie (export)
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
  stored_wh: number;
}

const C = {
  solar: "#f59e0b", // amber
  usage: "#ef4444", // red — grid afname (drawing from grid)
  gridPink: "#ec4899", // pink — grid injectie (export)
  battery: "#06b6d4", // blue — battery
  house: "#64748b", // slate — house consumption
};

// Grid color: red drawing from grid (>= 0), pink injecting (< 0). Hard split.
function gridColor(w: number) {
  return w >= 0 ? C.usage : C.gridPink;
}

const REFRESH_MS = 3000;

// The battery balances grid to ~0 via the CT meter; it hunts ±20-50W around zero.
// Snap that near-zero noise to 0 for DISPLAY only (logged data stays raw).
const GRID_DEADBAND = 40;
const gd = (w: number) => (Math.abs(w) < GRID_DEADBAND ? 0 : w);

function fmtW(w: number | null | undefined) {
  if (w == null) return "—";
  const a = Math.abs(w);
  if (a >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
}
function fmtSigned(w: number | null | undefined) {
  if (w == null) return "—";
  if (Math.round(w) === 0) return "0 W";
  return (w > 0 ? "+" : "−") + fmtW(Math.abs(w));
}

function netKwh(points: { t: number; grid_w: number }[]) {
  if (points.length < 2) return 0;
  const dt = points[1].t - points[0].t;
  return (points.reduce((s, p) => s + (p.grid_w ?? 0), 0) * dt) / 3600 / 1000;
}

// Plain-language live status — the novice's "tell me the verdict in words".
function statusLine(live: Live): { text: string; good: boolean } {
  const buying = gd(live.grid_w) > 0;
  const selling = gd(live.grid_w) < 0;
  const charging = live.bat_w < -60;
  const discharging = live.bat_w > 60;
  const sun = live.solar_w > 120;
  if (buying) return { text: discharging ? "Je koopt van het net — de batterij helpt mee." : "Je koopt stroom van het net.", good: false };
  if (selling) return { text: charging ? "Overschot: de batterij laadt én je verkoopt aan het net." : "Je verkoopt je overschot aan het net.", good: true };
  if (sun && charging) return { text: "De zon dekt je huis en laadt de batterij. Je koopt niets.", good: true };
  if (sun) return { text: "De zon dekt je huis. Je koopt niets van het net.", good: true };
  if (discharging) return { text: "De batterij voedt je huis. Je koopt niets van het net.", good: true };
  return { text: "In balans — nauwelijks uitwisseling met het net.", good: true };
}

function Stat({ icon: Icon, label, value, sub, color, big }: { icon: typeof Sun; label: string; value: string; sub?: React.ReactNode; color: string; big?: boolean }) {
  return (
    <div className={cn("border-2 border-border px-3 py-2.5", big && "ring-2 ring-inset")} style={big ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-4 w-4" style={{ color }} />
        {label}
      </div>
      <div className={cn("mt-1 font-bold tabular-nums leading-none", big ? "text-4xl" : "text-3xl")} style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function VerticalBattery({ index, soc, power, online, cap, rated }: { index: number; soc: number | null; power: number; online: boolean; cap: number | null; rated: number }) {
  const charging = online && power < 0;
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
        <div className="text-base font-bold tabular-nums" style={{ color: C.battery }}>{cap != null ? (cap / 1000).toFixed(1) : "—"} kWh</div>
        <div className="text-[10px] font-mono text-muted-foreground">{soc ?? "—"}% · {(rated / 1000).toFixed(1)} kWh</div>
        <div className="text-[10px] font-mono" style={{ color: charging || discharging ? C.battery : undefined }}>
          {state}
          {online && power !== 0 ? ` ${fmtW(Math.abs(power))}` : ""}
        </div>
      </div>
    </div>
  );
}

// --- Live flow diagram: nodes + animated arrows (thickness = watts) ----------
function FlowNode({ x, y, label, value, color }: { x: number; y: number; label: string; value: string; color: string }) {
  const w = 104, h = 46;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill="var(--card)" stroke={color} strokeWidth={2} />
      <text x={x} y={y - 7} textAnchor="middle" fontSize="9" fontWeight={700} fill="var(--muted-foreground)">{label.toUpperCase()}</text>
      <text x={x} y={y + 13} textAnchor="middle" fontSize="15" fontWeight={700} fill={color}>{value}</text>
    </g>
  );
}
function FlowDiagram({ live }: { live: Live }) {
  const W = 360, H = 280;
  const huis = { x: 180, y: 138 };
  const zon = { x: 180, y: 40 };
  const net = { x: 70, y: 238 };
  const bat = { x: 290, y: 238 };
  const sw = (w: number) => (w < 30 ? 1.2 : Math.max(2, Math.min(11, w / 200)));
  // dir 'in' = energy toward Huis (animate forward along the outer→Huis line)
  const gridShown = gd(live.grid_w); // deadbanded so the balancing hunt reads as 0
  const flows = [
    { from: zon, w: live.solar_w, color: C.solar, dir: "in" as const },
    { from: net, w: Math.abs(gridShown), color: gridColor(gridShown), dir: gridShown >= 0 ? ("in" as const) : ("out" as const) },
    { from: bat, w: Math.abs(live.bat_w), color: C.battery, dir: live.bat_w > 0 ? ("in" as const) : ("out" as const) },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full" style={{ maxHeight: 300 }}>
      {flows.map((f, i) => {
        const active = f.w >= 30;
        return (
          <g key={i}>
            <line x1={f.from.x} y1={f.from.y} x2={huis.x} y2={huis.y} stroke="var(--border)" strokeWidth={sw(f.w) + 3} opacity={0.25} />
            <line
              x1={f.from.x}
              y1={f.from.y}
              x2={huis.x}
              y2={huis.y}
              stroke={f.color}
              strokeWidth={sw(f.w)}
              strokeDasharray="3 7"
              opacity={active ? 0.95 : 0.3}
              style={active ? { animation: `${f.dir === "in" ? "flow-fwd" : "flow-rev"} 0.9s linear infinite` } : undefined}
            />
          </g>
        );
      })}
      <FlowNode x={zon.x} y={zon.y} label="Zon" value={fmtW(live.solar_w)} color={C.solar} />
      <FlowNode x={huis.x} y={huis.y} label="Huis" value={fmtW(live.house_w)} color={C.house} />
      <FlowNode x={net.x} y={net.y} label={gridShown === 0 ? "Net balans" : gridShown > 0 ? "Net afname" : "Net injectie"} value={fmtW(Math.abs(gridShown))} color={gridShown === 0 ? C.house : gridColor(gridShown)} />
      <FlowNode x={bat.x} y={bat.y} label={live.bat_w < 0 ? "Batterij laadt" : live.bat_w > 0 ? "Batterij ontlaadt" : "Batterij"} value={fmtW(Math.abs(live.bat_w))} color={C.battery} />
    </svg>
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

type MetricKey = "solar" | "usage" | "bat" | "house";
const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "solar", label: "Zon", color: C.solar },
  { key: "usage", label: "Grid", color: C.usage },
  { key: "bat", label: "Batterij", color: C.battery },
  { key: "house", label: "Verbruik", color: C.house },
];

export function EnergyWidget() {
  const [view, setView] = useState<"live" | "dag" | "geavanceerd">("live");
  const [liveWin, setLiveWin] = useState<number>(1800); // 300 (5m) / 1800 (30m)
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [show, setShow] = useState<Record<MetricKey, boolean>>({ solar: true, usage: true, bat: true, house: true });
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 1000));
  const { start: dayStart, end: dayEnd } = dayWindow(dayOffset);
  const isLive = view === "live";
  const isDay = view === "dag" || view === "geavanceerd";

  useEffect(() => {
    if (!isLive) return;
    setClock(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setClock(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });

  const fetchEnd = useMemo(() => Math.floor(Date.now() / 1000), [tick]);
  const winStart = isLive ? fetchEnd - liveWin - 60 : dayStart;
  const winEnd = isLive ? fetchEnd : dayEnd;
  const { data: hist } = useSWR<{ points: HistPoint[] }>(
    `/api/energy?start=${winStart}&end=${winEnd}`,
    fetcher,
    { refreshInterval: isLive ? REFRESH_MS : dayOffset === 0 ? 10000 : 0, keepPreviousData: true }
  );

  // sliding display window (live) / full day
  const domStart = isLive ? clock - liveWin : dayStart;
  const domEnd = isLive ? clock : dayEnd;
  const liveStep = liveWin <= 600 ? 60 : 300;
  const liveN = Math.round(liveWin / liveStep);
  const xTicks = isLive
    ? Array.from({ length: liveN + 1 }, (_, i) => domEnd - (liveN - i) * liveStep)
    : Array.from({ length: 9 }, (_, i) => dayStart + i * 3 * 3600);

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
  const dayNet = netKwh(points);
  const status = statusLine(live);
  const gridShown = gd(live.grid_w); // deadbanded live grid for the Net tile

  // grid red/pink split offset for the day-net & advanced charts
  const gVals = points.map((p) => p.grid_w).filter((v): v is number => v != null);
  const gMax = Math.max(0, ...gVals, 10);
  const gMin = Math.min(0, ...gVals, -10);
  const goff0 = Math.min(1, Math.max(0, gMax / (gMax - gMin)));

  // advanced combined chart data (battery flipped: charge up)
  const advData = points.map((p) => ({ ...p, bat: p.bat_w == null ? null : -p.bat_w, gridD: p.grid_w == null ? null : gd(p.grid_w), stored_kwh: p.stored_wh == null ? null : Math.round(p.stored_wh / 100) / 10 }));
  const ratedKwhNum = live.rated_wh / 1000;
  const toggle = (k: MetricKey) => setShow((s) => ({ ...s, [k]: !s[k] }));

  const xAxisCommon = {
    dataKey: "t" as const,
    type: "number" as const,
    scale: "linear" as const,
    domain: [domStart, domEnd] as [number, number],
    ticks: xTicks,
    tickFormatter: (t: number) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }),
    tick: { fontSize: 9, fill: "var(--muted-foreground)" },
    tickLine: false,
    axisLine: false,
    allowDataOverflow: true,
  };

  return (
    <WidgetTile
      title="Energie"
      size="xl"
      className="energy-wide lg:col-span-4 xl:col-span-6"
      headerRight={
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <span key={tick} className="inline-block h-2 w-2" style={{ background: "#22c55e", animation: `energy-heartbeat ${REFRESH_MS}ms ease-out forwards` }} />
          live · {live.batteries?.[0]?.mode ?? ""} · piek {fmtW(live.grid?.monthly_peak_w)}
        </span>
      }
    >
      <div className="space-y-3">
        {/* Plain-language verdict */}
        <div className="flex items-center gap-2 border-2 px-3 py-1.5 text-[12px] font-bold" style={{ borderColor: status.good ? "#22c55e" : C.usage, color: status.good ? "#16a34a" : C.usage }}>
          <span className="inline-block h-2 w-2 shrink-0" style={{ background: status.good ? "#22c55e" : C.usage }} />
          {status.text}
        </div>

        {/* Live stats — Grid is the hero (biggest) */}
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Stat
            icon={Zap}
            label={gridShown === 0 ? "Net balans" : gridShown > 0 ? "Net afname" : "Net injectie"}
            value={fmtW(Math.abs(gridShown))}
            color={gridShown === 0 ? C.house : gridColor(gridShown)}
            big
            sub={`${gridShown === 0 ? "batterij in balans" : gridShown > 0 ? "je koopt" : "je verkoopt"} · T${live.grid?.tariff ?? "?"}`}
          />
          <Stat icon={Sun} label="Zon" value={fmtW(live.solar_w)} color={C.solar} sub={live.solar?.total_yield_kwh != null ? `${live.solar.total_yield_kwh.toLocaleString("nl-BE")} kWh tot` : undefined} />
          <Stat icon={Home} label="Verbruik" value={fmtW(live.house_w)} color={C.house} />
          <div className="flex items-center justify-center gap-5 border-2 border-border px-2 py-1">
            {live.batteries.map((b, i) => (
              <VerticalBattery key={b.ip} index={i + 1} soc={b.soc} power={b.power_w} online={b.online} cap={b.capacity_wh} rated={b.rated_wh} />
            ))}
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
          <div className="flex">
            {(["live", "dag", "geavanceerd"] as const).map((v, i) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "border-2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
                  i > 0 && "border-l-0",
                  view === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "geavanceerd" ? "Geav." : v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {isLive && (
              <div className="flex">
                {([300, 1800] as const).map((w, i) => (
                  <button
                    key={w}
                    onClick={() => setLiveWin(w)}
                    className={cn(
                      "border-2 px-2 py-0.5 text-[10px] font-bold uppercase transition-colors",
                      i === 1 && "border-l-0",
                      liveWin === w ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {w === 300 ? "5m" : "30m"}
                  </button>
                ))}
              </div>
            )}
            {isDay && (
              <div className="flex items-center gap-1">
                <button onClick={() => setDayOffset((o) => o - 1)} className="border-2 border-border p-1 text-muted-foreground hover:text-foreground" aria-label="Vorige dag">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[92px] text-center text-[11px] font-bold tabular-nums">{dayLabel(dayOffset, dayStart)}</span>
                <button onClick={() => setDayOffset((o) => Math.min(0, o + 1))} disabled={dayOffset >= 0} className="border-2 border-border p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Volgende dag">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ===== LIVE: flow diagram + grid sparkline ===== */}
        {isLive && (
          <div className="space-y-2">
            <div className="border-2 border-border p-2">
              <FlowDiagram live={live} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Net (laatste {Math.round(liveWin / 60)} min)</span>
              <span className="text-[9px] italic text-muted-foreground">rood boven = afname · roze onder = injectie</span>
            </div>
            <div className="h-28 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={advData} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="liveGrid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={goff0} stopColor={C.usage} stopOpacity={0.5} />
                      <stop offset={goff0} stopColor={C.gridPink} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="liveGridStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={goff0} stopColor={C.usage} />
                      <stop offset={goff0} stopColor={C.gridPink} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis {...xAxisCommon} />
                  <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Area type="linear" dataKey="gridD" baseValue={0} stroke="url(#liveGridStroke)" fill="url(#liveGrid)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Batterij (laatste {Math.round(liveWin / 60)} min)</span>
              <span className="text-[9px] italic text-muted-foreground">boven 0 = laden · onder 0 = ontladen</span>
            </div>
            <div className="h-24 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={advData} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="liveBat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                      <stop offset="50%" stopColor={C.battery} stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis {...xAxisCommon} />
                  <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Area type="linear" dataKey="bat" baseValue={0} stroke={C.battery} fill="url(#liveBat)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ===== DAG: small multiples ===== */}
        {view === "dag" && (
          <div className="space-y-1">
            {/* A — Productie vs Verbruik */}
            <PanelHeader label="Productie vs verbruik" />
            <div className="h-36 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} syncId="energyDay" margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="dSolar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.solar} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.solar} stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="dHouse" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.house} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={C.house} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis {...xAxisCommon} hide />
                  <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="linear" dataKey="house_w" stroke={C.house} fill="url(#dHouse)" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
                  <Area type="linear" dataKey="solar_w" stroke={C.solar} fill="url(#dSolar)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* B — Net afname / injectie */}
            <PanelHeader label="Net" right={`${dayNet >= 0 ? "+" : "−"}${Math.abs(dayNet).toFixed(1)} kWh`} rightColor={gridColor(dayNet * 1000)} />
            <div className="h-28 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={advData} syncId="energyDay" margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="dGrid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={goff0} stopColor={C.usage} stopOpacity={0.55} />
                      <stop offset={goff0} stopColor={C.gridPink} stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="dGridStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={goff0} stopColor={C.usage} />
                      <stop offset={goff0} stopColor={C.gridPink} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis {...xAxisCommon} hide />
                  <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Area type="linear" dataKey="gridD" baseValue={0} stroke="url(#dGridStroke)" fill="url(#dGrid)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* C — Batterij: laden/ontladen (W) + lading (kWh) */}
            <PanelHeader label="Batterij — laden / ontladen · lading" right={`${storedKwh}/${ratedKwh} kWh · ${socPct}%`} rightColor={C.battery} />
            <div className="h-32 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={advData} syncId="energyDay" margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="dBat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="50%" stopColor={C.battery} stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis {...xAxisCommon} />
                  <YAxis yAxisId="w" orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <YAxis yAxisId="kwh" orientation="left" domain={[0, Math.ceil(ratedKwhNum)]} tick={{ fontSize: 8, fill: C.battery }} tickLine={false} axisLine={false} width={30} tickFormatter={(v) => `${v}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine yAxisId="w" y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Area yAxisId="w" type="linear" dataKey="bat" baseValue={0} stroke={C.battery} fill="url(#dBat)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                  <Line yAxisId="kwh" type="linear" dataKey="stored_kwh" stroke={C.battery} strokeWidth={2} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: "#22c55e" }} />laden (boven 0)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: "#f59e0b" }} />ontladen (onder 0)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: C.battery }} />lading (kWh, stippellijn)</span>
            </div>
          </div>
        )}

        {/* ===== GEAVANCEERD: the full combined chart (power users) ===== */}
        {view === "geavanceerd" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {METRICS.map((m) => (
                <button key={m.key} onClick={() => toggle(m.key)} className={cn("flex items-center gap-1.5 border-2 border-border px-2 py-0.5 text-[10px] font-bold transition-opacity", !show[m.key] && "opacity-35")}>
                  <span className="inline-block h-2 w-3" style={{ background: m.color }} />
                  {m.label}
                </button>
              ))}
              <span className="ml-auto text-[9px] italic text-muted-foreground">boven 0 = afname/laden/opwekken · onder 0 = injectie/ontladen</span>
            </div>
            <div className="h-96 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={advData} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="aSolar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.solar} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={C.solar} stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="aGridStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={goff0} stopColor={C.usage} />
                      <stop offset={goff0} stopColor={C.gridPink} />
                    </linearGradient>
                    <linearGradient id="aHouse" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.house} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={C.house} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis {...xAxisCommon} />
                  <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  {show.house && <Area type="linear" dataKey="house_w" stroke={C.house} fill="url(#aHouse)" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />}
                  {show.solar && <Area type="linear" dataKey="solar_w" stroke={C.solar} fill="url(#aSolar)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />}
                  {show.usage && <Line type="linear" dataKey="grid_w" stroke="url(#aGridStroke)" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls />}
                  {show.bat && <Line type="linear" dataKey="bat" stroke={C.battery} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </WidgetTile>
  );
}

function PanelHeader({ label, right, rightColor, hideRight }: { label: string; right?: string; rightColor?: string; hideRight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between pt-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      {!hideRight && right && <span className="text-[11px] font-bold tabular-nums" style={{ color: rightColor }}>{right}</span>}
    </div>
  );
}

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
