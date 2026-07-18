"use client";

import useSWR from "swr";
import { Zap } from "lucide-react";
import { Section, LivePulse } from "../ui";
import { EC, fmtKwh, fmtW, gd, gridColor, type HistPoint, type Live } from "@/lib/energy-format";
import { batteryEnergy, daysToCover, periodTotals, pointsInRange, sumBy } from "@/lib/energy-house";
import type { Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const WATER = "#3b82f6";
const GAS = "#f97316";

interface GasPoint { d: string; m3: number; kwh: number; eur: number }
interface WaterPoint { d: string; m3: number; liter: number; eur: number }

// One node of the diagram. `flow` drives the connector: >0 flows toward the
// house, <0 away from it, 0 renders the line dormant.
interface Node {
  key: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  color: string;
  flow: number;
  magnitude: number; // watts (live) or kWh-equivalent (period), for line weight
}

// The house sits at the centre; everything else is a supply or a sink around it.
// Live mode shows instantaneous rates, period mode shows totals over the range —
// same picture, different question.
export function HouseFlow({
  range,
  live,
  tick,
  intervalMs,
  compact,
}: {
  range: Range;
  live: Live | undefined;
  tick?: number;
  intervalMs?: number;
  compact?: boolean;
}) {
  const isLive = range.mode === "live";
  const days = daysToCover(range);

  // History is only needed to total up a past period; live mode reads the snapshot.
  const { data: hist } = useSWR<{ points: HistPoint[] }>(
    isLive ? null : `/api/energy?start=${range.start}&end=${range.fetchEnd}`,
    fetcher,
    { refreshInterval: range.canNext ? 0 : 30000, keepPreviousData: true }
  );
  const { data: gas } = useSWR<{ points: GasPoint[]; current_m3: number | null }>(
    `/api/energy?gas=1&days=${days}`,
    fetcher,
    { refreshInterval: 60000, keepPreviousData: true }
  );
  const { data: water } = useSWR<{ points: WaterPoint[]; flow_lpm: number | null }>(
    `/api/energy?water=1&days=${days}`,
    fetcher,
    { refreshInterval: 30000, keepPreviousData: true }
  );

  const gasDays = pointsInRange(gas?.points, range);
  const waterDays = pointsInRange(water?.points, range);
  const gasM3 = sumBy(gasDays, (p) => p.m3);
  const gasKwh = sumBy(gasDays, (p) => p.kwh);
  const waterL = sumBy(waterDays, (p) => p.liter);

  const totals = hist?.points ? periodTotals(hist.points, range) : null;
  const bat = hist?.points ? batteryEnergy(hist.points, range) : null;

  let nodes: Node[];
  let houseValue: string;
  let houseUnit: string;
  let houseSub: string;

  if (isLive && live) {
    const grid = gd(live.grid_w);
    const flowLpm = water?.flow_lpm ?? 0;
    // Gas has no instantaneous reading — the P1 register only ticks every few
    // minutes — so the live view shows today's total instead of a fake rate.
    const todayGas = gasDays.length ? gasDays[gasDays.length - 1].m3 : 0;

    nodes = [
      { key: "zon", label: "Zon", value: fmtW(live.solar_w), color: EC.solar, flow: live.solar_w, magnitude: live.solar_w },
      {
        key: "net",
        label: grid === 0 ? "Net balans" : grid > 0 ? "Net afname" : "Net injectie",
        value: fmtW(Math.abs(grid)),
        color: grid === 0 ? EC.house : gridColor(grid),
        flow: grid,
        magnitude: Math.abs(grid),
      },
      {
        key: "bat",
        label: live.bat_w < -60 ? "Batterij laadt" : live.bat_w > 60 ? "Batterij ontlaadt" : "Batterij",
        value: fmtW(Math.abs(live.bat_w)),
        sub: live.soc_avg != null ? `${live.soc_avg}% geladen` : undefined,
        color: EC.battery,
        flow: live.bat_w,
        magnitude: Math.abs(live.bat_w),
      },
      {
        key: "water",
        label: "Water",
        value: flowLpm > 0 ? flowLpm.toLocaleString("nl-BE", { maximumFractionDigits: 1 }) : "0",
        unit: "l/min",
        sub: `${Math.round(waterDays.length ? waterDays[waterDays.length - 1].liter : 0)} l vandaag`,
        color: WATER,
        flow: flowLpm > 0 ? 1 : 0,
        magnitude: flowLpm > 0 ? 900 : 0,
      },
      {
        key: "gas",
        label: "Gas",
        value: todayGas.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        unit: "m³",
        sub: "vandaag",
        color: GAS,
        flow: todayGas > 0 ? 1 : 0,
        magnitude: todayGas > 0 ? 700 : 0,
      },
    ];
    houseValue = fmtW(live.house_w);
    houseUnit = "";
    houseSub = live.soc_avg != null ? `batterij ${live.soc_avg}%` : "verbruik nu";
  } else {
    const t = totals ?? { solar: 0, house: 0, gridImport: 0, gridExport: 0, selfPct: null };
    // Line weights are compared against each other in kWh, so water (litres)
    // and gas (m³) get scaled onto the same footing via their kWh equivalent.
    nodes = [
      { key: "zon", label: "Zon geoogst", value: fmtKwh(t.solar, 1), unit: "kWh", color: EC.solar, flow: 1, magnitude: t.solar * 100 },
      {
        key: "net",
        label: "Van het net",
        value: fmtKwh(t.gridImport, 1),
        unit: "kWh",
        sub: `${fmtKwh(t.gridExport, 1)} kWh terug`,
        color: EC.import,
        flow: t.gridImport >= t.gridExport ? 1 : -1,
        magnitude: Math.max(t.gridImport, t.gridExport) * 100,
      },
      {
        key: "bat",
        label: "Batterij",
        value: fmtKwh(bat?.charged ?? 0, 1),
        unit: "kWh geladen",
        sub: `${fmtKwh(bat?.discharged ?? 0, 1)} kWh gebruikt${bat?.socEnd != null ? ` · nu ${bat.socEnd}%` : ""}`,
        color: EC.battery,
        flow: (bat?.discharged ?? 0) >= (bat?.charged ?? 0) ? 1 : -1,
        magnitude: Math.max(bat?.charged ?? 0, bat?.discharged ?? 0) * 100,
      },
      {
        key: "water",
        label: "Water",
        value: waterL >= 1000 ? fmtKwh(waterL / 1000, 2) : Math.round(waterL).toLocaleString("nl-BE"),
        unit: waterL >= 1000 ? "m³" : "liter",
        sub: `${waterDays.length} dag${waterDays.length === 1 ? "" : "en"}`,
        color: WATER,
        flow: waterL > 0 ? 1 : 0,
        magnitude: waterL / 4,
      },
      {
        key: "gas",
        label: "Gas",
        value: fmtKwh(gasM3, 2),
        unit: "m³",
        sub: `${fmtKwh(gasKwh, 0)} kWh warmte`,
        color: GAS,
        flow: gasM3 > 0 ? 1 : 0,
        magnitude: gasKwh * 100,
      },
    ];
    houseValue = fmtKwh(t.house, 1);
    houseUnit = "kWh";
    houseSub = t.selfPct != null ? `${t.selfPct}% zelf opgewekt` : "verbruik";
  }

  return (
    <Section
      title={isLive ? "Het huis nu" : `Het huis · ${range.label}`}
      icon={Zap}
      right={
        isLive && intervalMs != null ? (
          <LivePulse intervalMs={intervalMs} tick={tick ?? 0} label="live" />
        ) : (
          <span className="font-mono text-tiny text-muted-foreground">totalen over de periode</span>
        )
      }
    >
      {/* The diagram needs width to stay legible; phones get a stacked layout
          with the same numbers rather than a shrunken-to-illegible SVG. */}
      <div className="hidden sm:block">
        <HouseDiagram nodes={nodes} houseValue={houseValue} houseUnit={houseUnit} houseSub={houseSub} animate={isLive} compact={compact} />
      </div>
      <div className="sm:hidden">
        <HouseStack nodes={nodes} houseValue={houseValue} houseUnit={houseUnit} houseSub={houseSub} />
      </div>
    </Section>
  );
}

// Phone layout: the house as a banner, its supplies as a two-column grid.
function HouseStack({
  nodes,
  houseValue,
  houseUnit,
  houseSub,
}: {
  nodes: Node[];
  houseValue: string;
  houseUnit: string;
  houseSub: string;
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-xl border-2 px-3 py-3 text-center" style={{ borderColor: EC.house }}>
        <p className="text-tiny font-bold uppercase tracking-[0.16em] text-muted-foreground">Huis</p>
        <p className="mt-1 text-4xl font-black tabular-nums leading-none">
          {houseValue}
          {houseUnit && <span className="ml-1 text-lg font-semibold text-muted-foreground">{houseUnit}</span>}
        </p>
        <p className="mt-1 text-petite text-muted-foreground">{houseSub}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map((n) => (
          <div key={n.key} className="rounded-xl border px-2.5 py-2" style={{ borderColor: n.color }}>
            <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">{n.label}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight" style={{ color: n.color }}>
              {n.value}
              {n.unit && <span className="ml-1 text-tiny font-semibold text-muted-foreground">{n.unit}</span>}
            </p>
            {n.sub && <p className="mt-0.5 text-mini text-muted-foreground">{n.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Fixed viewBox, fluid width — the whole diagram scales as one unit, which is
// what makes it legible on both a phone and the kitchen wall display.
const VB = { w: 780, h: 470 };
const HOUSE = { x: 390, y: 235 };
const POS: Record<string, { x: number; y: number }> = {
  zon: { x: 390, y: 56 },
  net: { x: 96, y: 186 },
  bat: { x: 684, y: 186 },
  water: { x: 150, y: 404 },
  gas: { x: 630, y: 404 },
};

function HouseDiagram({
  nodes,
  houseValue,
  houseUnit,
  houseSub,
  animate,
  compact,
}: {
  nodes: Node[];
  houseValue: string;
  houseUnit: string;
  houseSub: string;
  animate: boolean;
  compact?: boolean;
}) {
  const weight = (m: number) => (m < 30 ? 1.5 : Math.max(2.5, Math.min(13, m / 220)));

  return (
    <svg
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      className="mx-auto w-full"
      style={{ maxHeight: compact ? undefined : 460 }}
      role="img"
      aria-label="Energiestromen van het huis"
    >
      {/* Connectors first so the node cards sit on top of the line ends. */}
      {nodes.map((n) => {
        const p = POS[n.key];
        const active = Math.abs(n.magnitude) >= 30 && n.flow !== 0;
        const w = weight(Math.abs(n.magnitude));
        return (
          <g key={`line-${n.key}`}>
            <line x1={p.x} y1={p.y} x2={HOUSE.x} y2={HOUSE.y} stroke="var(--border)" strokeWidth={w + 3} opacity={0.3} />
            <line
              x1={p.x}
              y1={p.y}
              x2={HOUSE.x}
              y2={HOUSE.y}
              stroke={n.color}
              strokeWidth={w}
              strokeDasharray="4 8"
              opacity={active ? 0.95 : 0.25}
              style={
                active && animate
                  ? { animation: `${n.flow > 0 ? "flow-fwd" : "flow-rev"} 0.9s linear infinite` }
                  : undefined
              }
            />
          </g>
        );
      })}

      <HouseNode value={houseValue} unit={houseUnit} sub={houseSub} />

      {nodes.map((n) => (
        <FlowCard key={n.key} node={n} x={POS[n.key].x} y={POS[n.key].y} />
      ))}
    </svg>
  );
}

function HouseNode({ value, unit, sub }: { value: string; unit: string; sub: string }) {
  const w = 236;
  const bodyH = 116;
  const roofH = 52;
  const left = HOUSE.x - w / 2;
  const bodyTop = HOUSE.y - bodyH / 2 + 14;

  return (
    <g>
      <polygon
        points={`${HOUSE.x},${bodyTop - roofH} ${left - 16},${bodyTop} ${left + w + 16},${bodyTop}`}
        fill="var(--card)"
        stroke={EC.house}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <rect x={left} y={bodyTop} width={w} height={bodyH} rx={10} fill="var(--card)" stroke={EC.house} strokeWidth={2.5} />
      <text x={HOUSE.x} y={bodyTop + 30} textAnchor="middle" fontSize="13" fontWeight={700} letterSpacing="2" fill="var(--muted-foreground)">
        HUIS
      </text>
      <text x={HOUSE.x} y={bodyTop + 76} textAnchor="middle" fontSize="42" fontWeight={800} fill="var(--foreground)">
        {value}
        {unit && (
          <tspan fontSize="19" fontWeight={600} fill="var(--muted-foreground)">
            {" "}
            {unit}
          </tspan>
        )}
      </text>
      <text x={HOUSE.x} y={bodyTop + 100} textAnchor="middle" fontSize="14" fill="var(--muted-foreground)">
        {sub}
      </text>
    </g>
  );
}

function FlowCard({ node, x, y }: { node: Node; x: number; y: number }) {
  const w = 178;
  const h = node.sub ? 92 : 74;

  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={12} fill="var(--card)" stroke={node.color} strokeWidth={2.5} />
      <text x={x} y={y - h / 2 + 24} textAnchor="middle" fontSize="12" fontWeight={700} letterSpacing="1.2" fill="var(--muted-foreground)">
        {node.label.toUpperCase()}
      </text>
      <text x={x} y={y - h / 2 + 56} textAnchor="middle" fontSize="27" fontWeight={800} fill={node.color}>
        {node.value}
        {node.unit && (
          <tspan fontSize="14" fontWeight={600} fill="var(--muted-foreground)">
            {" "}
            {node.unit}
          </tspan>
        )}
      </text>
      {node.sub && (
        <text x={x} y={y - h / 2 + 78} textAnchor="middle" fontSize="12.5" fill="var(--muted-foreground)">
          {node.sub}
        </text>
      )}
    </g>
  );
}
