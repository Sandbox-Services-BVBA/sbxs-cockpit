"use client";

import useSWR from "swr";
import { Zap } from "lucide-react";
import { Section, Verdict, LivePulse } from "../ui";
import { EC, fmtEur, fmtKwh, fmtSigned, fmtW, GRID_HOLD_MS, gd, gridColor, statusLine, type Battery, type HistPoint, type Live } from "@/lib/energy-format";
import { useStablePower } from "@/hooks/use-stable-power";
import {
  batteryEnergy,
  daysToCover,
  energyCost,
  periodTotals,
  pointsInRange,
  sumBy,
  type SummaryPoint,
} from "@/lib/energy-house";
import { ROOM_SLOTS, fmtTemp, readHouseClimate, tempColor, type ClimateSeries, type HouseClimate, type Reading } from "@/lib/energy-rooms";
import type { Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const WATER = "#3b82f6";
const GAS = "#f97316";
const OUTSIDE = "#64748b";
// VENT_IN is a duller teal than EC.battery's cyan — close enough to read as
// "related" (both are cool tones) without being mistaken for it. VENT_OUT is
// violet specifically because every warm hue already on this diagram is taken
// (EC.solar amber, GAS orange, EC.import red) and the exhaust pipe sits right
// next to the solar connector — same-family colours there would blur together.
const VENT_IN = "#0891b2";
const VENT_OUT = "#9333ea";

// The physical damper reports 4 states, not 2 — collapsing "opening" into
// "open" is exactly what made this unclear before. `pending` marks the two
// transitional states so the badge can look visibly "in progress" rather than
// silently jumping between two static labels.
function bypassState(raw: string): { text: string; open: boolean; pending: boolean } {
  if (raw === "open") return { text: "bypass open", open: true, pending: false };
  if (raw === "opening") return { text: "bypass opent…", open: true, pending: true };
  if (raw === "closing") return { text: "bypass sluit…", open: false, pending: true };
  return { text: "bypass dicht", open: false, pending: false };
}

interface GasPoint { d: string; m3: number; kwh: number; eur: number }
interface WaterPoint { d: string; m3: number; liter: number; eur: number }

// Airco (MELCloud Home climate.* units) — only the fields the diagram needs.
interface AircoSummary {
  name: string;
  room: string | null;
  available: boolean;
  on: boolean;
  mode: string; // off | cool | heat | auto | dry | fan_only
  currentTemp: number | null;
  targetTemp: number | null;
}
interface AircoResp { units: AircoSummary[] }

const AIRCO_MODE_COLOR: Record<string, string> = {
  cool: "#06b6d4",
  heat: "#f97316",
  auto: "#22c55e",
  dry: "#9333ea",
  fan_only: "#64748b",
};
function aircoBadge(a: AircoSummary): { color: string; text: string } {
  if (!a.available) return { color: "#94a3b8", text: "offline" };
  if (!a.on) return { color: "#94a3b8", text: "uit" };
  const color = AIRCO_MODE_COLOR[a.mode] ?? "#06b6d4";
  const verb =
    a.mode === "cool" ? "koelt" : a.mode === "heat" ? "verwarmt" : a.mode === "dry" ? "ontvocht." : a.mode === "fan_only" ? "vent." : "auto";
  const t = a.targetTemp != null && a.mode !== "fan_only" && a.mode !== "dry" ? ` ${a.targetTemp}°` : "";
  return { color, text: `${verb}${t}` };
}
interface VentLive {
  supply_temp_c: number;
  extract_temp_c: number;
  supply_airflow_m3h: number;
  extract_airflow_m3h: number;
  supply_preset_m3h: number;
  extract_preset_m3h: number;
  bypass: string; // "open" | "closed" | "opening" | "closing"
  error?: string;
}

// A supply we pay for. These all enter from the left so the "what this costs us"
// story reads as one column.
interface Supply {
  key: string;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  eur?: number;
  color: string;
  flow: number; // >0 into the house, <0 out of it, 0 dormant
  magnitude: number;
}

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

  const { data: hist } = useSWR<{ points: HistPoint[] }>(
    isLive ? null : `/api/energy?start=${range.start}&end=${range.fetchEnd}`,
    fetcher,
    { refreshInterval: range.canNext ? 0 : 30000, keepPreviousData: true }
  );
  const { data: gas } = useSWR<{ points: GasPoint[] }>(`/api/energy?gas=1&days=${days}`, fetcher, {
    refreshInterval: 60000,
    keepPreviousData: true,
  });
  const { data: water } = useSWR<{ points: WaterPoint[]; flow_lpm: number | null }>(
    `/api/energy?water=1&days=${days}`,
    fetcher,
    { refreshInterval: 30000, keepPreviousData: true }
  );
  const { data: summary } = useSWR<{ points: SummaryPoint[] }>(`/api/energy?summary=1&days=${days}`, fetcher, {
    refreshInterval: 300000,
    keepPreviousData: true,
  });
  // Room temperatures are a live-only concern — a day-average tells you nothing
  // useful about whether the nursery is too warm right now.
  const { data: climate } = useSWR<{ series: ClimateSeries[] }>(
    isLive ? "/api/energy?climate_history=1&hours=1" : null,
    fetcher,
    { refreshInterval: 60000, keepPreviousData: true }
  );
  // Same reasoning: ventilation flow rate is a live rate, not a period total.
  const { data: vent } = useSWR<VentLive>(isLive ? "/api/ventilation" : null, fetcher, {
    refreshInterval: 10000,
    keepPreviousData: true,
  });
  // Airco (living-room unit) — a live status too, shown on the ground floor.
  const { data: airco } = useSWR<AircoResp>(isLive ? "/api/airco" : null, fetcher, {
    refreshInterval: 30000,
    keepPreviousData: true,
  });

  // Grid power hunts ±20-50W around zero while the battery balances it; hold
  // the sign steady for GRID_HOLD_MS before trusting it, so a tick-to-tick
  // flicker across the deadband boundary doesn't flip the tile every second.
  const rawGrid = live ? gd(live.grid_w) : 0;
  const grid = useStablePower(rawGrid, tick ?? 0, GRID_HOLD_MS);

  const gasDays = pointsInRange(gas?.points, range);
  const waterDays = pointsInRange(water?.points, range);
  const gasM3 = sumBy(gasDays, (p) => p.m3);
  const gasKwh = sumBy(gasDays, (p) => p.kwh);
  const waterL = sumBy(waterDays, (p) => p.liter);
  const cost = energyCost(summary?.points, sumBy(gasDays, (p) => p.eur), sumBy(waterDays, (p) => p.eur), range);

  const totals = hist?.points ? periodTotals(hist.points, range) : null;
  const bat = hist?.points ? batteryEnergy(hist.points, range) : null;
  const houseClimate: HouseClimate | null = isLive ? readHouseClimate(climate?.series) : null;
  const houseVent = isLive && vent && !vent.error ? vent : null;
  const livingAirco: AircoSummary | null = isLive ? airco?.units?.find((u) => u.room === "living") ?? null : null;

  let supplies: Supply[];
  let solar: Supply;
  let houseValue: string;
  let houseUnit: string;
  let houseSub: string;

  if (isLive && live) {
    const flowLpm = water?.flow_lpm ?? 0;
    const todayGas = gasDays.length ? gasDays[gasDays.length - 1].m3 : 0;
    const todayWater = waterDays.length ? waterDays[waterDays.length - 1].liter : 0;

    supplies = [
      {
        key: "net",
        label: grid === 0 ? "Net balans" : grid > 0 ? "Net afname" : "Net injectie",
        value: fmtW(Math.abs(grid)),
        color: grid === 0 ? EC.house : gridColor(grid),
        flow: grid,
        magnitude: Math.abs(grid),
        sub: grid !== rawGrid ? `ruw ${fmtSigned(rawGrid)}` : undefined,
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
      {
        key: "water",
        label: "Water",
        value: flowLpm > 0 ? flowLpm.toLocaleString("nl-BE", { maximumFractionDigits: 1 }) : "0",
        unit: "l/min",
        sub: `${Math.round(todayWater)} l vandaag`,
        color: WATER,
        flow: flowLpm > 0 ? 1 : 0,
        magnitude: flowLpm > 0 ? 900 : 0,
      },
    ];
    solar = { key: "zon", label: "Zon", value: fmtW(live.solar_w), color: EC.solar, flow: 1, magnitude: live.solar_w };
    houseValue = fmtW(live.house_w);
    houseUnit = "";
    houseSub = `${fmtEur(cost.total)} vandaag`;
  } else {
    const t = totals ?? { solar: 0, house: 0, gridImport: 0, gridExport: 0, selfPct: null };
    supplies = [
      {
        key: "net",
        label: "Van het net",
        value: fmtKwh(t.gridImport, 1),
        unit: "kWh",
        sub: `${fmtKwh(t.gridExport, 1)} kWh terug`,
        eur: cost.power,
        color: EC.import,
        flow: t.gridImport >= t.gridExport ? 1 : -1,
        magnitude: Math.max(t.gridImport, t.gridExport) * 100,
      },
      {
        key: "gas",
        label: "Gas",
        value: fmtKwh(gasM3, 2),
        unit: "m³",
        sub: `${fmtKwh(gasKwh, 0)} kWh warmte`,
        eur: cost.gas,
        color: GAS,
        flow: gasM3 > 0 ? 1 : 0,
        magnitude: gasKwh * 100,
      },
      {
        key: "water",
        label: "Water",
        value: waterL >= 1000 ? fmtKwh(waterL / 1000, 2) : Math.round(waterL).toLocaleString("nl-BE"),
        unit: waterL >= 1000 ? "m³" : "liter",
        sub: `${waterDays.length} dag${waterDays.length === 1 ? "" : "en"}`,
        eur: cost.water,
        color: WATER,
        flow: waterL > 0 ? 1 : 0,
        magnitude: waterL / 4,
      },
    ];
    solar = {
      key: "zon",
      label: "Zon geoogst",
      value: fmtKwh(t.solar, 1),
      unit: "kWh",
      color: EC.solar,
      flow: 1,
      magnitude: t.solar * 100,
    };
    houseValue = fmtKwh(t.house, 1);
    houseUnit = "kWh";
    houseSub = t.selfPct != null ? `${t.selfPct}% zelf opgewekt` : "verbruik";
  }

  const status = isLive && live ? statusLine(live, grid) : null;

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
      <div className="space-y-3">
        {status && <Verdict text={status.text} good={status.good} />}

        <CostStrip cost={cost} isLive={isLive} label={isLive ? "vandaag" : range.label} />

        <div className="hidden sm:block">
          <HouseDiagram
            supplies={supplies}
            solar={solar}
            batteries={live?.batteries ?? []}
            throughput={
              isLive || !bat ? null : `${fmtKwh(bat.charged, 1)} kWh geladen · ${fmtKwh(bat.discharged, 1)} kWh gebruikt`
            }
            climate={houseClimate}
            vent={houseVent}
            airco={livingAirco}
            houseValue={houseValue}
            houseUnit={houseUnit}
            houseSub={houseSub}
            animate={isLive}
            compact={compact}
          />
        </div>
        <div className="sm:hidden">
          <HouseStack
            supplies={supplies}
            solar={solar}
            batteries={live?.batteries ?? []}
            climate={houseClimate}
            vent={houseVent}
            airco={livingAirco}
            houseValue={houseValue}
            houseUnit={houseUnit}
            houseSub={houseSub}
          />
        </div>
      </div>
    </Section>
  );
}

// Running cost for the period, split by carrier. Negative electricity means the
// injection revenue outweighed what was bought.
function CostStrip({ cost, isLive, label }: { cost: EnergyCostShape; isLive: boolean; label: string }) {
  const items = [
    { label: "Stroom", value: cost.power, color: EC.import },
    { label: "Gas", value: cost.gas, color: GAS },
    { label: "Water", value: cost.water, color: WATER },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2">
      <div className="mr-1">
        <p className="text-mini font-bold uppercase tracking-[0.16em] text-muted-foreground">Kost {label}</p>
        <p className="text-2xl font-black tabular-nums leading-tight" style={{ color: cost.total > 0 ? EC.import : EC.self }}>
          {fmtEur(cost.total)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.label} className="rounded-lg border border-border px-2 py-1 text-mini">
            <span className="text-muted-foreground">{i.label} </span>
            <b className="tabular-nums" style={{ color: i.value < 0 ? EC.self : i.color }}>
              {fmtEur(i.value)}
            </b>
          </span>
        ))}
      </div>
      {isLive && <span className="ml-auto text-mini text-muted-foreground">indicatief · vaste tarieven</span>}
    </div>
  );
}

interface EnergyCostShape {
  power: number;
  gas: number;
  water: number;
  total: number;
}

// ---- Diagram ---------------------------------------------------------------

// minY < 0 gives headroom above the roofline for the two ventilation pipes,
// without touching a single existing coordinate below y=0.
const VB = { w: 1080, h: 536, minY: -165 };
const HOUSE = { x0: 350, x1: 730, roofTop: 40, eaves: 178, midEnd: 336, groundEnd: 492 };
const SUPPLY_X = 132;
const ASSET_X = 946;
const SUPPLY_Y: Record<string, number> = { net: 188, gas: 318, water: 442 };
const WALL_Y: Record<string, number> = { net: 240, gas: 316, water: 432 };
const GROUND_Y = 500;
// Where the two roof pipes meet the roof slope, and where their cards float
// above it. Which side is "in" vs "out" is arbitrary — the pipes are drawn
// symmetrically and only the label/colour tell them apart. Both cards share
// one height (134, tall enough for the bypass badge) so their tops line up
// even though only the intake card uses the badge row.
const VENT_ROOF_Y = 118;
const VENT_IN_X = 420;
const VENT_OUT_X = 660;
const VENT_CARD_Y = -78;
const VENT_CARD_H = 134;

function HouseDiagram({
  supplies,
  solar,
  batteries,
  throughput,
  climate,
  vent,
  airco,
  houseValue,
  houseUnit,
  houseSub,
  animate,
  compact,
}: {
  supplies: Supply[];
  solar: Supply;
  batteries: Battery[];
  throughput: string | null;
  climate: HouseClimate | null;
  vent: VentLive | null;
  airco: AircoSummary | null;
  houseValue: string;
  houseUnit: string;
  houseSub: string;
  animate: boolean;
  compact?: boolean;
}) {
  const weight = (m: number) => (m < 30 ? 1.5 : Math.max(2.5, Math.min(12, m / 240)));
  // Airflow lives on a m³/h scale (tens to hundreds), not watts, so it needs
  // its own thickness mapping — the watt-tuned one would floor almost everything.
  const ventWeight = (m: number) => (m < 10 ? 1.5 : Math.max(2.5, Math.min(9, m / 40)));
  const mid = (HOUSE.x0 + HOUSE.x1) / 2;
  const packs = batteries.slice(0, 2);

  return (
    <svg
      viewBox={`0 ${VB.minY} ${VB.w} ${VB.h - VB.minY}`}
      className="mx-auto w-full"
      style={{ maxHeight: compact ? undefined : 700 }}
      role="img"
      aria-label="Doorsnede van het huis met energiestromen, ventilatie en temperaturen"
    >
      {/* Connectors sit behind everything so the cards cap the line ends. */}
      {supplies.map((s) => (
        <Connector
          key={`c-${s.key}`}
          x1={SUPPLY_X + 108}
          y1={SUPPLY_Y[s.key]}
          x2={HOUSE.x0}
          y2={WALL_Y[s.key]}
          color={s.color}
          weight={weight(Math.abs(s.magnitude))}
          flow={s.flow}
          animate={animate}
        />
      ))}
      <Connector
        x1={ASSET_X - 104}
        y1={110}
        x2={mid + 66}
        y2={HOUSE.roofTop + 70}
        color={solar.color}
        weight={weight(Math.abs(solar.magnitude))}
        flow={solar.flow}
        animate={animate}
      />
      {packs.map((b, i) => (
        <Connector
          key={`cb-${b.ip}`}
          x1={ASSET_X - 104}
          y1={i === 0 ? 288 : 428}
          x2={HOUSE.x1}
          y2={i === 0 ? 270 : 400}
          color={EC.battery}
          weight={weight(Math.abs(b.power_w))}
          flow={b.power_w}
          animate={animate}
        />
      ))}
      {vent && (
        <>
          {/* Fresh air down into the roof */}
          <Connector
            x1={VENT_IN_X}
            y1={VENT_CARD_Y + VENT_CARD_H / 2}
            x2={VENT_IN_X}
            y2={VENT_ROOF_Y}
            color={VENT_IN}
            weight={ventWeight(vent.supply_airflow_m3h)}
            flow={vent.supply_airflow_m3h}
            animate={animate}
          />
          {/* Stale air up out of the roof */}
          <Connector
            x1={VENT_OUT_X}
            y1={VENT_ROOF_Y}
            x2={VENT_OUT_X}
            y2={VENT_CARD_Y + VENT_CARD_H / 2}
            color={VENT_OUT}
            weight={ventWeight(vent.extract_airflow_m3h)}
            flow={vent.extract_airflow_m3h}
            animate={animate}
          />
        </>
      )}

      <HouseBody climate={climate} airco={airco} value={houseValue} unit={houseUnit} sub={houseSub} />

      {/* Ground line, so the house reads as sitting on something. */}
      <line x1={40} y1={GROUND_Y} x2={VB.w - 40} y2={GROUND_Y} stroke="var(--border)" strokeWidth={2} />

      {climate && <OutsideBadge climate={climate} />}

      {supplies.map((s) => (
        <SupplyCard key={s.key} supply={s} x={SUPPLY_X} y={SUPPLY_Y[s.key]} />
      ))}

      <AssetCard x={ASSET_X} y={110} label={solar.label} value={solar.value} unit={solar.unit} color={solar.color} />
      {packs.map((b, i) => (
        <BatteryCard key={b.ip} x={ASSET_X} y={i === 0 ? 288 : 428} index={i + 1} battery={b} />
      ))}
      {vent && (
        <>
          <VentCard
            x={VENT_IN_X}
            y={VENT_CARD_Y}
            label="Ventilatie in"
            temp={vent.supply_temp_c}
            flow={vent.supply_airflow_m3h}
            preset={vent.supply_preset_m3h}
            color={VENT_IN}
            bypass={vent.bypass}
          />
          <VentCard
            x={VENT_OUT_X}
            y={VENT_CARD_Y}
            label="Ventilatie uit"
            temp={vent.extract_temp_c}
            flow={vent.extract_airflow_m3h}
            preset={vent.extract_preset_m3h}
            color={VENT_OUT}
          />
        </>
      )}
      {throughput && (
        <text x={ASSET_X} y={GROUND_Y + 22} textAnchor="middle" fontSize="12.5" fill="var(--muted-foreground)">
          {throughput}
        </text>
      )}
    </svg>
  );
}

function Connector({
  x1,
  y1,
  x2,
  y2,
  color,
  weight,
  flow,
  animate,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  weight: number;
  flow: number;
  animate: boolean;
}) {
  const active = weight > 1.5 && flow !== 0;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border)" strokeWidth={weight + 3} opacity={0.3} />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={weight}
        strokeDasharray="4 8"
        opacity={active ? 0.95 : 0.25}
        style={active && animate ? { animation: `${flow > 0 ? "flow-fwd" : "flow-rev"} 0.9s linear infinite` } : undefined}
      />
    </g>
  );
}

// The house as a cross-section: attic on top, three rooms in the middle, the
// living space on the ground floor.
function HouseBody({ climate, airco, value, unit, sub }: { climate: HouseClimate | null; airco: AircoSummary | null; value: string; unit: string; sub: string }) {
  const { x0, x1, roofTop, eaves, midEnd, groundEnd } = HOUSE;
  const mid = (x0 + x1) / 2;
  const overhang = 22;
  const middleRooms = ROOM_SLOTS.filter((s) => s.floor === "middle");
  const roomW = (x1 - x0) / middleRooms.length;

  return (
    <g>
      {/* Roof / attic */}
      <polygon
        points={`${mid},${roofTop} ${x0 - overhang},${eaves} ${x1 + overhang},${eaves}`}
        fill="var(--card)"
        stroke={EC.house}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {climate && (
        <RoomLabel
          x={mid}
          y={roofTop + 74}
          label="Bureau · zolder"
          reading={climate.rooms.bureau}
          noSensor={!climate.rooms.bureau}
          showClimate
        />
      )}

      {/* Middle floor */}
      <rect x={x0} y={eaves} width={x1 - x0} height={midEnd - eaves} fill="var(--card)" stroke={EC.house} strokeWidth={2.5} />
      {/* Room detail is a live-only concern; a period average would say nothing
          useful about whether a room is comfortable now. Without readings the
          floor stays undivided rather than showing empty labelled boxes. */}
      {climate &&
        middleRooms.map((slot, i) => (
          <g key={slot.id}>
            {i > 0 && (
              <line x1={x0 + i * roomW} y1={eaves} x2={x0 + i * roomW} y2={midEnd} stroke={EC.house} strokeWidth={1.5} opacity={0.5} />
            )}
            <RoomLabel
              x={x0 + i * roomW + roomW / 2}
              y={eaves + (midEnd - eaves) / 2 - 8}
              label={slot.label}
              reading={climate.rooms[slot.id] ?? null}
              showClimate
              small
            />
          </g>
        ))}

      {/* Ground floor — carries the headline number for the whole house */}
      <rect x={x0} y={midEnd} width={x1 - x0} height={groundEnd - midEnd} fill="var(--card)" stroke={EC.house} strokeWidth={2.5} />
      <line x1={x0} y1={midEnd} x2={x1} y2={midEnd} stroke={EC.house} strokeWidth={2.5} />
      {/* The headline is the whole house, so it is labelled as such — the living
          room keeps its own reading in the corner rather than being conflated. */}
      <text x={mid} y={midEnd + 26} textAnchor="middle" fontSize="12" fontWeight={700} letterSpacing="1.4" fill="var(--muted-foreground)">
        HUIS TOTAAL
      </text>
      <text x={mid} y={midEnd + 76} textAnchor="middle" fontSize="42" fontWeight={800} fill="var(--foreground)">
        {value}
        {unit && (
          <tspan fontSize="18" fontWeight={600} fill="var(--muted-foreground)">
            {" "}
            {unit}
          </tspan>
        )}
      </text>
      <text x={mid} y={midEnd + 101} textAnchor="middle" fontSize="14" fill="var(--muted-foreground)">
        {sub}
      </text>
      {climate && (
        <text x={x0 + 14} y={groundEnd - 12} fontSize="12.5" fontWeight={700} fill={tempColor(climate.rooms.woonkamer)}>
          <tspan fontSize="10.5" fontWeight={700} letterSpacing="1" fill="var(--muted-foreground)">
            WOONKAMER{" "}
          </tspan>
          {fmtTemp(climate.rooms.woonkamer)}
          {climate.rooms.woonkamer?.rh != null && (
            <tspan fontSize="11" fontWeight={600} fill="var(--muted-foreground)">
              {" "}
              · {Math.round(climate.rooms.woonkamer.rh)}%
            </tspan>
          )}
        </text>
      )}
      {/* Living-room airco status, mirrored on the opposite ground-floor corner */}
      {airco &&
        (() => {
          const b = aircoBadge(airco);
          return (
            <text x={x1 - 14} y={groundEnd - 12} textAnchor="end" fontSize="12.5" fontWeight={700} fill={b.color}>
              <tspan fontSize="10.5" fontWeight={700} letterSpacing="1" fill="var(--muted-foreground)">
                AIRCO{" "}
              </tspan>
              {b.text}
            </text>
          );
        })()}
    </g>
  );
}

function RoomLabel({
  x,
  y,
  label,
  reading,
  noSensor,
  showClimate,
  small,
}: {
  x: number;
  y: number;
  label: string;
  reading: Reading | null;
  noSensor?: boolean;
  showClimate: boolean;
  small?: boolean;
}) {
  return (
    <g>
      <text x={x} y={y} textAnchor="middle" fontSize={small ? 11 : 12} fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        {label.toUpperCase()}
      </text>
      {showClimate &&
        (noSensor ? (
          <text x={x} y={y + 24} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)" opacity={0.7}>
            geen sensor
          </text>
        ) : (
          <>
            <text x={x} y={y + (small ? 28 : 30)} textAnchor="middle" fontSize={small ? 24 : 26} fontWeight={800} fill={tempColor(reading)}>
              {fmtTemp(reading)}
            </text>
            {reading?.rh != null && (
              <text x={x} y={y + (small ? 46 : 50)} textAnchor="middle" fontSize="11.5" fill="var(--muted-foreground)">
                {Math.round(reading.rh)}% vocht
              </text>
            )}
          </>
        ))}
    </g>
  );
}

function OutsideBadge({ climate }: { climate: HouseClimate }) {
  const x = SUPPLY_X;
  const y = 66;
  const w = 216;
  const h = 84;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={12} fill="var(--card)" stroke={OUTSIDE} strokeWidth={2.5} strokeDasharray="6 4" />
      <text x={x} y={y - h / 2 + 22} textAnchor="middle" fontSize="11.5" fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        BUITEN
      </text>
      <text x={x} y={y - h / 2 + 56} textAnchor="middle" fontSize="28" fontWeight={800} fill={tempColor(climate.outside)}>
        {fmtTemp(climate.outside)}
      </text>
      {climate.outside?.rh != null && (
        <text x={x} y={y - h / 2 + 74} textAnchor="middle" fontSize="11.5" fill="var(--muted-foreground)">
          {Math.round(climate.outside.rh)}% vocht
        </text>
      )}
    </g>
  );
}

function SupplyCard({ supply, x, y }: { supply: Supply; x: number; y: number }) {
  const w = 216;
  const h = supply.eur != null || supply.sub ? 100 : 78;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={12} fill="var(--card)" stroke={supply.color} strokeWidth={2.5} />
      <text x={x} y={y - h / 2 + 22} textAnchor="middle" fontSize="11.5" fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        {supply.label.toUpperCase()}
      </text>
      <text x={x} y={y - h / 2 + 54} textAnchor="middle" fontSize="26" fontWeight={800} fill={supply.color}>
        {supply.value}
        {supply.unit && (
          <tspan fontSize="13" fontWeight={600} fill="var(--muted-foreground)">
            {" "}
            {supply.unit}
          </tspan>
        )}
      </text>
      {supply.sub && (
        <text x={x} y={y - h / 2 + 74} textAnchor="middle" fontSize="11.5" fill="var(--muted-foreground)">
          {supply.sub}
        </text>
      )}
      {supply.eur != null && (
        <text x={x} y={y - h / 2 + 92} textAnchor="middle" fontSize="14" fontWeight={700} fill={supply.eur < 0 ? EC.self : "var(--foreground)"}>
          {fmtEur(supply.eur)}
        </text>
      )}
    </g>
  );
}

function AssetCard({ x, y, label, value, unit, color }: { x: number; y: number; label: string; value: string; unit?: string; color: string }) {
  const w = 208;
  const h = 78;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={12} fill="var(--card)" stroke={color} strokeWidth={2.5} />
      <text x={x} y={y - h / 2 + 22} textAnchor="middle" fontSize="11.5" fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        {label.toUpperCase()}
      </text>
      <text x={x} y={y - h / 2 + 56} textAnchor="middle" fontSize="26" fontWeight={800} fill={color}>
        {value}
        {unit && (
          <tspan fontSize="13" fontWeight={600} fill="var(--muted-foreground)">
            {" "}
            {unit}
          </tspan>
        )}
      </text>
    </g>
  );
}

// A ventilation pipe card: temperature plus a flow-vs-preset bar, matching the
// battery charge bar's visual language. `tag` carries the bypass state — only
// the intake side shows it, since bypass only changes that duct's routing.
function VentCard({
  x,
  y,
  label,
  temp,
  flow,
  preset,
  color,
  bypass,
}: {
  x: number;
  y: number;
  label: string;
  temp: number;
  flow: number;
  preset: number;
  color: string;
  bypass?: string;
}) {
  const w = 190;
  const h = VENT_CARD_H;
  const top = y - h / 2;
  const barW = w - 32;
  const barX = x - barW / 2;
  const pct = preset > 0 ? Math.max(0, Math.min(100, (flow / preset) * 100)) : 0;
  const bp = bypass ? bypassState(bypass) : null;

  return (
    <g>
      <rect x={x - w / 2} y={top} width={w} height={h} rx={12} fill="var(--card)" stroke={color} strokeWidth={2.5} />
      <text x={x} y={top + 20} textAnchor="middle" fontSize="11" fontWeight={700} letterSpacing="1" fill="var(--muted-foreground)">
        {label.toUpperCase()}
      </text>
      <text x={x} y={top + 52} textAnchor="middle" fontSize="24" fontWeight={800} fill={color}>
        {temp.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        <tspan fontSize="13" fontWeight={600} fill="var(--muted-foreground)">
          °C
        </tspan>
      </text>
      <rect x={barX} y={top + 64} width={barW} height={10} rx={5} fill="var(--muted)" stroke="var(--border)" strokeWidth={1} />
      <rect x={barX} y={top + 64} width={(barW * pct) / 100} height={10} rx={5} fill={color} />
      <text x={x} y={top + 92} textAnchor="middle" fontSize="10.5" fontWeight={600} fill="var(--muted-foreground)">
        {Math.round(flow)} m³/h
      </text>
      {/* A filled pill when settled-open, a hollow dashed one mid-transition,
          and a muted outline when closed — three distinct looks so the state
          reads at a glance instead of from small text alone. */}
      {bp && (
        <>
          <rect
            x={x - (w - 28) / 2}
            y={top + 102}
            width={w - 28}
            height={24}
            rx={12}
            fill={bp.pending ? "none" : bp.open ? color : "transparent"}
            stroke={color}
            strokeWidth={bp.pending ? 2 : 1.5}
            strokeDasharray={bp.pending ? "3 4" : undefined}
            opacity={bp.pending ? 0.9 : bp.open ? 1 : 0.5}
          />
          <text
            x={x}
            y={top + 118}
            textAnchor="middle"
            fontSize="11"
            fontWeight={800}
            letterSpacing="0.3"
            fill={bp.open && !bp.pending ? "#fff" : color}
          >
            {bp.text.toUpperCase()}
          </text>
        </>
      )}
    </g>
  );
}

// Each pack gets its own card with a charge bar — the per-pack state is the
// interesting bit, which an averaged number hides.
function BatteryCard({ x, y, index, battery }: { x: number; y: number; index: number; battery: Battery }) {
  const w = 208;
  const h = 108;
  const top = y - h / 2;
  const soc = battery.soc ?? 0;
  const barW = w - 36;
  const barX = x - barW / 2;
  const flowing = Math.abs(battery.power_w) > 30;
  const state = !battery.online ? "offline" : battery.power_w < -30 ? "laadt" : battery.power_w > 30 ? "ontlaadt" : "idle";

  return (
    <g>
      <rect x={x - w / 2} y={top} width={w} height={h} rx={12} fill="var(--card)" stroke={EC.battery} strokeWidth={2.5} opacity={battery.online ? 1 : 0.5} />
      <text x={x} y={top + 21} textAnchor="middle" fontSize="11.5" fontWeight={700} letterSpacing="1.1" fill="var(--muted-foreground)">
        BATTERIJ {index}
      </text>
      <text x={x} y={top + 53} textAnchor="middle" fontSize="26" fontWeight={800} fill={EC.battery}>
        {battery.soc != null ? `${soc}%` : "—"}
      </text>

      {/* Charge bar */}
      <rect x={barX} y={top + 64} width={barW} height={12} rx={6} fill="var(--muted)" stroke="var(--border)" strokeWidth={1} />
      <rect x={barX} y={top + 64} width={Math.max(0, Math.min(100, soc)) * (barW / 100)} height={12} rx={6} fill={EC.battery} />

      <text x={x} y={top + 96} textAnchor="middle" fontSize="12.5" fill="var(--muted-foreground)">
        {flowing ? `${state} · ${fmtW(Math.abs(battery.power_w))}` : state}
        {battery.capacity_wh != null && ` · ${(battery.capacity_wh / 1000).toFixed(1)} kWh`}
      </text>
    </g>
  );
}

// ---- Phone layout ----------------------------------------------------------

function HouseStack({
  supplies,
  solar,
  batteries,
  climate,
  vent,
  airco,
  houseValue,
  houseUnit,
  houseSub,
}: {
  supplies: Supply[];
  solar: Supply;
  batteries: Battery[];
  climate: HouseClimate | null;
  vent: VentLive | null;
  airco: AircoSummary | null;
  houseValue: string;
  houseUnit: string;
  houseSub: string;
}) {
  const bp = vent ? bypassState(vent.bypass) : null;
  const ab = airco ? aircoBadge(airco) : null;
  const cards = [solar, ...supplies];
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
        {cards.map((n) => (
          <div key={n.key} className="rounded-xl border px-2.5 py-2" style={{ borderColor: n.color }}>
            <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">{n.label}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight" style={{ color: n.color }}>
              {n.value}
              {n.unit && <span className="ml-1 text-tiny font-semibold text-muted-foreground">{n.unit}</span>}
            </p>
            {n.sub && <p className="mt-0.5 text-mini text-muted-foreground">{n.sub}</p>}
            {n.eur != null && <p className="mt-0.5 text-mini font-bold">{fmtEur(n.eur)}</p>}
          </div>
        ))}
        {batteries.slice(0, 2).map((b, i) => (
          <div key={b.ip} className="rounded-xl border px-2.5 py-2" style={{ borderColor: EC.battery }}>
            <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">Batterij {i + 1}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight" style={{ color: EC.battery }}>
              {b.soc != null ? `${b.soc}%` : "—"}
            </p>
            <p className="mt-0.5 text-mini text-muted-foreground">
              {b.power_w < -30 ? `laadt ${fmtW(-b.power_w)}` : b.power_w > 30 ? `ontlaadt ${fmtW(b.power_w)}` : "idle"}
            </p>
          </div>
        ))}
      </div>

      {vent && bp && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border px-2.5 py-2" style={{ borderColor: VENT_IN }}>
            <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">Ventilatie in</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight" style={{ color: VENT_IN }}>
              {vent.supply_temp_c.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°C
            </p>
            <p className="mt-0.5 text-mini text-muted-foreground">{Math.round(vent.supply_airflow_m3h)} m³/h</p>
            <span
              className="mt-1.5 inline-block rounded-full border px-2 py-0.5 text-mini font-extrabold uppercase tracking-wide"
              style={{
                borderColor: VENT_IN,
                borderStyle: bp.pending ? "dashed" : "solid",
                background: !bp.pending && bp.open ? VENT_IN : "transparent",
                color: !bp.pending && bp.open ? "#fff" : VENT_IN,
                opacity: bp.pending ? 0.9 : bp.open ? 1 : 0.6,
              }}
            >
              {bp.text}
            </span>
          </div>
          <div className="rounded-xl border px-2.5 py-2" style={{ borderColor: VENT_OUT }}>
            <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">Ventilatie uit</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight" style={{ color: VENT_OUT }}>
              {vent.extract_temp_c.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°C
            </p>
            <p className="mt-0.5 text-mini text-muted-foreground">{Math.round(vent.extract_airflow_m3h)} m³/h</p>
          </div>
        </div>
      )}

      {airco && ab && (
        <div className="rounded-xl border px-2.5 py-2" style={{ borderColor: ab.color }}>
          <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">Airco woonkamer</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums leading-tight" style={{ color: ab.color }}>
            {ab.text}
          </p>
          <p className="mt-0.5 text-mini text-muted-foreground">
            {airco.currentTemp != null ? `${airco.currentTemp}° nu` : "—"}
            {airco.on && airco.targetTemp != null ? ` · doel ${airco.targetTemp}°` : ""}
          </p>
        </div>
      )}

      {climate && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-dashed px-2.5 py-2" style={{ borderColor: OUTSIDE }}>
            <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">Buiten</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: tempColor(climate.outside) }}>
              {fmtTemp(climate.outside)}
            </p>
          </div>
          {ROOM_SLOTS.map((slot) => {
            const r = climate.rooms[slot.id];
            return (
              <div key={slot.id} className="rounded-xl border border-border px-2.5 py-2">
                <p className="text-mini font-bold uppercase tracking-wide text-muted-foreground">{slot.label}</p>
                {r ? (
                  <>
                    <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: tempColor(r) }}>
                      {fmtTemp(r)}
                    </p>
                    {r.rh != null && <p className="mt-0.5 text-mini text-muted-foreground">{Math.round(r.rh)}% vocht</p>}
                  </>
                ) : (
                  <p className="mt-1.5 text-mini text-muted-foreground">geen sensor</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
