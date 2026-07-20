"use client";

import useSWR from "swr";
import { readHouseClimate, fmtTemp, tempColor, type ClimateSeries } from "@/lib/energy-rooms";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Same legend colours as the history chart below this diagram (sections/ventilation.tsx).
const SUPPLY = "#06b6d4"; // fresh/tempered air into the house
const EXTRACT = "#f59e0b"; // stale air out of the house
const OUTSIDE = "#64748b";

export interface VentFlowLive {
  supply_temp_c: number;
  extract_temp_c: number;
  supply_airflow_m3h: number;
  extract_airflow_m3h: number;
  supply_preset_m3h: number;
  extract_preset_m3h: number;
  bypass: string; // "open" | "closed" | "opening" | "closing"
  filter: "normal" | "dirty";
}

const bypassOpen = (b: string) => b === "open" || b === "opening";

// A heat-recovery ventilator swaps warmth between two air streams that never
// mix: fresh outdoor air in, stale indoor air out. Bypass does not stop the
// intake — mechanical ventilation is always moving air both ways — it only
// decides whether the incoming stream is routed through the core (heat
// recovered) or around it (used for free cooling when outside is cooler).
// So there is exactly one valve, at the fresh-air branch point, and two
// candidate paths from there to the supply duct; only one is ever live.
export function VentilationFlow({ live }: { live: VentFlowLive }) {
  const { data: climate } = useSWR<{ series?: ClimateSeries[] }>("/api/energy?climate_history=1&hours=1", fetcher, {
    refreshInterval: 60000,
    keepPreviousData: true,
  });
  const outside = readHouseClimate(climate?.series).outside;

  const open = bypassOpen(live.bypass);
  const supplyOn = live.supply_airflow_m3h > 10;
  const extractOn = live.extract_airflow_m3h > 10;
  const dirty = live.filter === "dirty";

  return (
    <>
      <div className="hidden sm:block">
        <VentDiagram outside={outside} live={live} open={open} supplyOn={supplyOn} extractOn={extractOn} dirty={dirty} />
      </div>
      <div className="sm:hidden">
        <VentStack outside={outside} live={live} open={open} dirty={dirty} />
      </div>
    </>
  );
}

const VB = { w: 960, h: 460 };
const OUT = { x0: 50, x1: 250, y0: 160, y1: 300 };
const CORE = { x0: 390, x1: 560, y0: 140, y1: 320 };
const SUP = { x0: 690, x1: 910, y0: 78, y1: 202 };
const RET = { x0: 690, x1: 910, y0: 258, y1: 382 };
const FRESH_Y = 178;
const STALE_Y = 282;

function VentDiagram({
  outside,
  live,
  open,
  supplyOn,
  extractOn,
  dirty,
}: {
  outside: ReturnType<typeof readHouseClimate>["outside"];
  live: VentFlowLive;
  open: boolean;
  supplyOn: boolean;
  extractOn: boolean;
  dirty: boolean;
}) {
  const bypassPeakY = 104;
  const mid = (CORE.x0 + CORE.x1) / 2;

  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="mx-auto w-full" style={{ maxHeight: 460 }} role="img" aria-label="Ventilatiestromen">
      {/* The core box is drawn first, opaque, so the through-core duct segments
          below read as pipes crossing its casing rather than being hidden by it. */}
      <CoreBox dirty={dirty} />

      {/* Fresh air: outside -> branch point -> house */}
      <Duct x1={(OUT.x0 + OUT.x1) / 2} y1={OUT.y0} x2={CORE.x0} y2={FRESH_Y} color={SUPPLY} on={supplyOn} />
      <Duct x1={CORE.x1} y1={FRESH_Y} x2={SUP.x0} y2={(SUP.y0 + SUP.y1) / 2} color={SUPPLY} on={supplyOn} />
      {/* Through the core (bypass closed) */}
      <Duct x1={CORE.x0} y1={FRESH_Y} x2={CORE.x1} y2={FRESH_Y} color={SUPPLY} on={supplyOn && !open} weight={supplyOn && !open ? 5 : 1.5} />
      {/* Around the core (bypass open) */}
      <polyline
        points={`${CORE.x0},${FRESH_Y} ${mid},${bypassPeakY} ${CORE.x1},${FRESH_Y}`}
        fill="none"
        stroke={SUPPLY}
        strokeWidth={supplyOn && open ? 5 : 1.5}
        strokeLinejoin="round"
        strokeDasharray="4 8"
        opacity={supplyOn && open ? 0.95 : 0.25}
        style={supplyOn && open ? { animation: "flow-fwd 0.9s linear infinite" } : undefined}
      />

      {/* Stale air: house -> core -> outside, always through the shared casing */}
      <Duct x1={RET.x0} y1={(RET.y0 + RET.y1) / 2} x2={CORE.x1} y2={STALE_Y} color={EXTRACT} on={extractOn} reverse />
      <Duct x1={CORE.x0} y1={STALE_Y} x2={(OUT.x0 + OUT.x1) / 2} y2={OUT.y1} color={EXTRACT} on={extractOn} reverse />
      <Duct x1={CORE.x1} y1={STALE_Y} x2={CORE.x0} y2={STALE_Y} color={EXTRACT} on={extractOn} reverse weight={extractOn ? 5 : 1.5} />

      {/* Valve sits on top so a duct crossing near the branch point never masks it. */}
      <ValveBadge x={CORE.x0} y={FRESH_Y} open={open} />

      <OutsideCard x={(OUT.x0 + OUT.x1) / 2} y={(OUT.y0 + OUT.y1) / 2} temp={outside} />
      <FlowCard
        x={SUP.x0}
        y={SUP.y0}
        label="Inblaas"
        sub="naar woning"
        temp={live.supply_temp_c}
        flow={live.supply_airflow_m3h}
        preset={live.supply_preset_m3h}
        color={SUPPLY}
      />
      <FlowCard
        x={RET.x0}
        y={RET.y0}
        label="Retour"
        sub="uit woning"
        temp={live.extract_temp_c}
        flow={live.extract_airflow_m3h}
        preset={live.extract_preset_m3h}
        color={EXTRACT}
      />
    </svg>
  );
}

function Duct({
  x1,
  y1,
  x2,
  y2,
  color,
  on,
  reverse,
  weight = 5,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  on: boolean;
  reverse?: boolean;
  weight?: number;
}) {
  const w = on ? weight : 1.5;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border)" strokeWidth={w + 3} opacity={0.25} />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={w}
        strokeDasharray="4 8"
        opacity={on ? 0.95 : 0.25}
        style={on ? { animation: `${reverse ? "flow-rev" : "flow-fwd"} 0.9s linear infinite` } : undefined}
      />
    </g>
  );
}

// The valve sits at the branch point: closed routes air along the straight
// through-core duct, open routes it along the arc. The gate glyph rotates to
// match so the state reads at a glance, not just from the label.
function ValveBadge({ x, y, open }: { x: number; y: number; open: boolean }) {
  const r = 22;
  const color = open ? SUPPLY : "var(--muted-foreground)";
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="var(--card)" stroke={color} strokeWidth={2.5} />
      <line
        x1={x - 11}
        y1={y}
        x2={x + 11}
        y2={y}
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
        transform={`rotate(${open ? -55 : 0} ${x} ${y})`}
      />
      <text x={x} y={y + r + 20} textAnchor="middle" fontSize="11.5" fontWeight={700} letterSpacing="0.8" fill={color}>
        KLEP {open ? "OPEN" : "DICHT"}
      </text>
    </g>
  );
}

function CoreBox({ dirty }: { dirty: boolean }) {
  const { x0, x1, y0, y1 } = CORE;
  const mid = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  return (
    <g>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={14} fill="var(--card)" stroke="var(--foreground)" strokeWidth={2.5} opacity={0.9} />
      {/* Cross-hatch reads as "heat exchanger core" without needing an icon font */}
      {[0.28, 0.42, 0.56, 0.72].map((f) => (
        <line key={f} x1={x0 + (x1 - x0) * f} y1={y0 + 14} x2={x0 + (x1 - x0) * f} y2={y1 - 14} stroke="var(--border)" strokeWidth={2} />
      ))}
      <text x={mid} y={y0 - 14} textAnchor="middle" fontSize="12" fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        WARMTEWISSELAAR
      </text>
      {dirty && (
        <text x={mid} y={midY + 5} textAnchor="middle" fontSize="11.5" fontWeight={700} fill="#ef4444">
          FILTER VUIL
        </text>
      )}
    </g>
  );
}

function OutsideCard({ x, y, temp }: { x: number; y: number; temp: ReturnType<typeof readHouseClimate>["outside"] }) {
  const w = 190;
  const h = 122;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={12} fill="var(--card)" stroke={OUTSIDE} strokeWidth={2.5} strokeDasharray="6 4" />
      <text x={x} y={y - h / 2 + 24} textAnchor="middle" fontSize="11.5" fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        BUITEN
      </text>
      <text x={x} y={y - h / 2 + 62} textAnchor="middle" fontSize="30" fontWeight={800} fill={tempColor(temp)}>
        {fmtTemp(temp)}
      </text>
      {temp?.rh != null && (
        <text x={x} y={y - h / 2 + 86} textAnchor="middle" fontSize="11.5" fill="var(--muted-foreground)">
          {Math.round(temp.rh)}% vocht
        </text>
      )}
    </g>
  );
}

function FlowCard({
  x,
  y,
  label,
  sub,
  temp,
  flow,
  preset,
  color,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  temp: number;
  flow: number;
  preset: number;
  color: string;
}) {
  const w = 220;
  const h = 124;
  const barW = w - 32;
  const barX = x - barW / 2 + 16;
  const pct = preset > 0 ? Math.max(0, Math.min(100, (flow / preset) * 100)) : 0;

  return (
    <g>
      <rect x={x - 16} y={y} width={w} height={h} rx={12} fill="var(--card)" stroke={color} strokeWidth={2.5} />
      <text x={x - 16 + w / 2} y={y + 22} textAnchor="middle" fontSize="11.5" fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        {label.toUpperCase()} · {sub}
      </text>
      <text x={x - 16 + w / 2} y={y + 54} textAnchor="middle" fontSize="26" fontWeight={800} fill={color}>
        {temp.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        <tspan fontSize="14" fontWeight={600} fill="var(--muted-foreground)">
          °C
        </tspan>
      </text>
      <rect x={barX} y={y + 68} width={barW} height={11} rx={5.5} fill="var(--muted)" stroke="var(--border)" strokeWidth={1} />
      <rect x={barX} y={y + 68} width={(barW * pct) / 100} height={11} rx={5.5} fill={color} />
      <text x={x - 16 + w / 2} y={y + 98} textAnchor="middle" fontSize="12.5" fontWeight={700} fill="var(--muted-foreground)">
        {Math.round(flow)} m³/h
        {preset > 0 && <tspan fontWeight={500}> · doel {Math.round(preset)}</tspan>}
      </text>
    </g>
  );
}

// ---- Phone layout -----------------------------------------------------------

function VentStack({
  outside,
  live,
  open,
  dirty,
}: {
  outside: ReturnType<typeof readHouseClimate>["outside"];
  live: VentFlowLive;
  open: boolean;
  dirty: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-dashed px-2.5 py-2" style={{ borderColor: OUTSIDE }}>
          <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">Buiten</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: tempColor(outside) }}>
            {fmtTemp(outside)}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border px-2.5 py-2" style={{ borderColor: open ? SUPPLY : "var(--border)" }}>
          <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">Bypassklep</p>
          <p className="mt-0.5 text-lg font-black" style={{ color: open ? SUPPLY : "var(--muted-foreground)" }}>
            {open ? "OPEN" : "DICHT"}
          </p>
          {dirty && <p className="mt-0.5 text-mini font-bold text-red-500">filter vuil</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StackFlow label="Inblaas" sub="naar woning" temp={live.supply_temp_c} flow={live.supply_airflow_m3h} preset={live.supply_preset_m3h} color={SUPPLY} />
        <StackFlow label="Retour" sub="uit woning" temp={live.extract_temp_c} flow={live.extract_airflow_m3h} preset={live.extract_preset_m3h} color={EXTRACT} />
      </div>
    </div>
  );
}

function StackFlow({
  label,
  sub,
  temp,
  flow,
  preset,
  color,
}: {
  label: string;
  sub: string;
  temp: number;
  flow: number;
  preset: number;
  color: string;
}) {
  const pct = preset > 0 ? Math.max(0, Math.min(100, (flow / preset) * 100)) : 0;
  return (
    <div className="rounded-xl border px-2.5 py-2" style={{ borderColor: color }}>
      <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">
        {label} <span className="font-normal normal-case">· {sub}</span>
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight" style={{ color }}>
        {temp.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°C
      </p>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="mt-1 text-mini text-muted-foreground">{Math.round(flow)} m³/h</p>
    </div>
  );
}
