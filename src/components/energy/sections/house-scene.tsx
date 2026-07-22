"use client";

import { useState } from "react";
import useSWR from "swr";
import { Sun, Wind, Snowflake, Flame, Droplet, Zap, Cpu } from "lucide-react";
import { Section, LivePulse } from "../ui";
import { cn } from "@/lib/utils";
import {
  EC,
  fmtW,
  gd,
  gridColor,
  GRID_HOLD_MS,
  statusLine,
  type Live,
} from "@/lib/energy-format";
import { useStablePower } from "@/hooks/use-stable-power";
import { fmtTemp, readHouseClimate, tempColor, type ClimateSeries, type HouseClimate, type Reading } from "@/lib/energy-rooms";
import { AircoUnitCard, sendAirco, type AircoUnit } from "./airco";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const REFRESH_AIRCO = 30000;

interface AircoResp { units: AircoUnit[] }
interface VentLive {
  supply_temp_c: number;
  extract_temp_c: number;
  supply_airflow_m3h: number;
  extract_airflow_m3h: number;
  bypass: string;
  error?: string;
}

const AIRCO_MODE_COLOR: Record<string, string> = { cool: "#06b6d4", heat: "#f97316", auto: "#22c55e", dry: "#9333ea", fan_only: "#64748b" };
function aircoView(a: AircoUnit): { color: string; label: string } {
  if (!a.available) return { color: "#94a3b8", label: "offline" };
  if (!a.on) return { color: "#94a3b8", label: "uit" };
  const color = AIRCO_MODE_COLOR[a.mode] ?? "#06b6d4";
  const verb = a.mode === "cool" ? "koelt" : a.mode === "heat" ? "verwarmt" : a.mode === "dry" ? "ontvocht." : a.mode === "fan_only" ? "vent." : "auto";
  const t = a.targetTemp != null && a.mode !== "fan_only" && a.mode !== "dry" ? ` → ${a.targetTemp}°` : "";
  return { color, label: `${verb}${t}` };
}

// A subtle room-fill wash: neutral when comfortable, warm/cool only when the
// temperature is meaningfully outside the comfort band. Never tints missing data.
function tintStyle(r: Reading | null | undefined): React.CSSProperties {
  if (!r || r.temp == null) return {};
  const t = r.temp;
  if (t >= 25) return { background: "rgba(249,115,22,0.16)" };
  if (t >= 23.5) return { background: "rgba(245,158,11,0.11)" };
  if (t < 16) return { background: "rgba(59,130,246,0.15)" };
  if (t < 19) return { background: "rgba(6,182,212,0.10)" };
  return {};
}

// Airco status chip — tappable to open the real (optimistic/debounced) controls.
function AircoChip({ unit, active, onClick }: { unit: AircoUnit; active: boolean; onClick: () => void }) {
  const v = aircoView(unit);
  return (
    <button
      onClick={onClick}
      className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-mini font-bold uppercase tracking-wide transition-colors", active && "ring-2 ring-offset-0")}
      style={{ borderColor: v.color, color: v.color, background: unit.on ? `${v.color}1a` : "transparent" }}
    >
      <Snowflake className="h-3 w-3" />
      airco {v.label}
    </button>
  );
}

// A room tile: name, temperature (foreground ink) + tint wash, RH, provenance,
// and an airco chip for rooms that have a unit.
function RoomTile({
  name,
  reading,
  provenance,
  unit,
  activeUnit,
  onAirco,
  className,
}: {
  name: string;
  reading: Reading | null;
  provenance?: string;
  unit?: AircoUnit | null;
  activeUnit?: string | null;
  onAirco?: (u: AircoUnit) => void;
  className?: string;
}) {
  const has = reading && reading.temp != null;
  return (
    <div className={cn("flex flex-col justify-between rounded-lg border border-border/70 px-2.5 py-2", className)} style={tintStyle(reading)}>
      <div className="text-mini font-bold uppercase tracking-wide text-muted-foreground">{name}</div>
      <div>
        {has ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: tempColor(reading) }}>
              {fmtTemp(reading)}
            </span>
            {reading?.rh != null && <span className="text-mini text-muted-foreground">{Math.round(reading.rh)}%</span>}
          </div>
        ) : (
          <div className="text-mini text-muted-foreground">geen sensor</div>
        )}
        {provenance && <div className="text-[10px] text-muted-foreground/80">{provenance}</div>}
        {unit && onAirco && <AircoChip unit={unit} active={activeUnit === unit.id} onClick={() => onAirco(unit)} />}
      </div>
    </div>
  );
}

// A single converging-energy row inside the heart.
function FlowRow({ icon: Icon, label, value, color, dir }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: string; color: string; dir: string }) {
  return (
    <div className="flex items-center gap-2 text-mini">
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-muted-foreground/70">{dir}</span>
      <span className="ml-auto font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

export function HouseScene({ live, tick, intervalMs }: { live: Live | undefined; tick?: number; intervalMs?: number }) {
  const [openUnit, setOpenUnit] = useState<string | null>(null);

  const { data: climateData } = useSWR<{ series: ClimateSeries[] }>("/api/energy?climate_history=1&hours=1", fetcher, { refreshInterval: 60000, keepPreviousData: true });
  const { data: ventData } = useSWR<VentLive>("/api/ventilation", fetcher, { refreshInterval: 10000, keepPreviousData: true });
  const { data: aircoData, mutate: mutateAirco } = useSWR<AircoResp>("/api/airco", fetcher, { refreshInterval: REFRESH_AIRCO, keepPreviousData: true });
  const { data: gasData } = useSWR<{ points: { m3: number }[] }>("/api/energy?gas=1&days=1", fetcher, { refreshInterval: 60000, keepPreviousData: true });
  const { data: waterData } = useSWR<{ points: { liter: number }[]; flow_lpm: number | null }>("/api/energy?water=1&days=1", fetcher, { refreshInterval: 30000, keepPreviousData: true });

  const climate: HouseClimate | null = climateData ? readHouseClimate(climateData.series) : null;
  const vent = ventData && !ventData.error ? ventData : null;
  const aircoByRoom: Record<string, AircoUnit> = {};
  for (const u of aircoData?.units ?? []) if (u.room) aircoByRoom[u.room] = u;
  const openUnitObj = (aircoData?.units ?? []).find((u) => u.id === openUnit) ?? null;

  const rawGrid = live ? gd(live.grid_w) : 0;
  const grid = useStablePower(rawGrid, tick ?? 0, GRID_HOLD_MS);
  const status = live ? statusLine(live, grid) : null;

  const gasToday = gasData?.points?.length ? gasData.points[gasData.points.length - 1].m3 : 0;
  const waterToday = waterData?.points?.length ? waterData.points[waterData.points.length - 1].liter : 0;
  const flowLpm = waterData?.flow_lpm ?? 0;
  const peakW = live?.grid?.monthly_peak_w ?? null;

  // Airco chip → open the full controls; provenance for rooms fed by an airco sensor.
  const onAirco = (u: AircoUnit) => setOpenUnit((cur) => (cur === u.id ? null : u.id));
  const prov = (room: string) => (aircoByRoom[room] && climate?.rooms[room] == null ? "via airco" : undefined);
  // Rooms whose only temperature source is their airco unit: surface that reading.
  const readingFor = (room: string): Reading | null => {
    const r = climate?.rooms[room] ?? null;
    if (r && r.temp != null) return r;
    const u = aircoByRoom[room];
    if (u && u.currentTemp != null) return { temp: u.currentTemp, rh: null };
    return r;
  };

  return (
    <Section
      title="Het huis nu"
      icon={Zap}
      right={intervalMs != null ? <LivePulse intervalMs={intervalMs} tick={tick ?? 0} label="live" /> : undefined}
    >
      <div className="space-y-3">
        {status && (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: status.good ? `${EC.self}55` : `${EC.import}55` }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: status.good ? EC.self : EC.import }} />
            <span className="text-petite">{status.text}</span>
          </div>
        )}

        {/* ---- The house cross-section (side view: left = front, right = back) ---- */}
        <div className="relative mx-auto max-w-[580px]">
          {/* Gable roof drawn as one outlined triangle so it reads as a house.
              Solar sits on the front slope (left), ventilation on the back (right). */}
          <div className="relative">
            <svg viewBox="0 0 100 46" preserveAspectRatio="none" className="block h-[88px] w-full" aria-hidden="true">
              <polygon points="0,45 50,3 100,45" fill="var(--card)" stroke={EC.house} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="absolute inset-x-0 bottom-2 flex items-end justify-between px-6">
              <div className="flex items-center gap-1.5">
                <Sun className="h-4 w-4 shrink-0" style={{ color: EC.solar }} />
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Zon · voordak</div>
                  <div className="text-base font-bold tabular-nums leading-none" style={{ color: EC.solar }}>{fmtW(live?.solar_w ?? 0)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-right">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Vent · achterdak</div>
                  <div className="text-[10px] tabular-nums leading-tight text-muted-foreground">
                    {vent ? <>in {vent.supply_temp_c.toFixed(1)}° · {Math.round(vent.supply_airflow_m3h)} m³/h</> : "—"}
                  </div>
                </div>
                <Wind className="h-4 w-4 shrink-0" style={{ color: EC.extract }} />
              </div>
            </div>
          </div>

          {/* House body (walls) */}
          <div className="space-y-px border-2 border-t-0 bg-border/40 p-px" style={{ borderColor: EC.house }}>
            {/* Attic — Bureau (office airco) */}
            <RoomTile name="Zolder · Bureau" reading={readingFor("bureau")} provenance={prov("bureau")} unit={aircoByRoom.office ?? null} activeUnit={openUnit} onAirco={onAirco} className="min-h-[68px]" />

            {/* Middle floor — Master bedroom (front) · Badkamer · Babykamer (back) */}
            <div className="grid grid-cols-3 gap-px">
              <RoomTile name="Slaapkamer" reading={readingFor("slaapkamer")} provenance={prov("slaapkamer")} unit={aircoByRoom.bedroom ?? null} activeUnit={openUnit} onAirco={onAirco} className="min-h-[76px]" />
              <RoomTile name="Badkamer" reading={readingFor("badkamer")} className="min-h-[76px]" />
              <RoomTile name="Babykamer" reading={readingFor("babykamer")} className="min-h-[76px]" />
            </div>

            {/* Ground floor — Woonkamer (living airco) + Technical room (the heart) */}
            <div className="grid grid-cols-2 gap-px">
              <RoomTile name="Gelijkvloers · Woonkamer" reading={readingFor("woonkamer")} provenance={prov("woonkamer")} unit={aircoByRoom.living ?? null} activeUnit={openUnit} onAirco={onAirco} className="min-h-[120px]" />

              {/* The heart: house total + everything converges here */}
              <div className="flex flex-col rounded-lg border-2 px-3 py-2" style={{ borderColor: `${EC.house}` }}>
                <div className="flex items-center gap-1.5 text-mini font-bold uppercase tracking-wide text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5" /> Technische ruimte · hart
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-3xl font-black tabular-nums leading-none">{fmtW(live?.house_w ?? 0)}</span>
                  <span className="text-mini text-muted-foreground">huis nu</span>
                </div>
                {peakW != null && <div className="text-[10px] text-muted-foreground">piek deze maand {fmtW(peakW)}</div>}
                <div className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5">
                  <FlowRow icon={Sun} label="Zon" color={EC.solar} dir="→" value={fmtW(live?.solar_w ?? 0)} />
                  <FlowRow icon={Zap} label={grid === 0 ? "Net" : grid > 0 ? "Net afname" : "Net injectie"} color={grid === 0 ? EC.house : gridColor(grid)} dir={grid === 0 ? "·" : grid > 0 ? "→" : "←"} value={grid === 0 ? "in balans" : fmtW(Math.abs(grid))} />
                  <FlowRow icon={Zap} label="Batterij" color={EC.battery} dir={live && live.bat_w > 60 ? "→" : live && live.bat_w < -60 ? "←" : "·"} value={live?.soc_avg != null ? `${live.soc_avg}% · ${live.bat_w > 60 ? "ontlaadt" : live.bat_w < -60 ? "laadt" : "idle"}` : "—"} />
                  <FlowRow icon={Flame} label="Gas" color={EC.solar} dir="→" value={`${gasToday.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³`} />
                  <FlowRow icon={Droplet} label="Water" color="#3b82f6" dir="→" value={flowLpm > 0 ? `${flowLpm.toLocaleString("nl-BE", { maximumFractionDigits: 1 })} l/min` : `${Math.round(waterToday)} l`} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tapped airco → the real optimistic/debounced controls */}
        {openUnitObj && (
          <div className="rounded-xl border border-primary/40 p-1">
            <AircoUnitCard unit={openUnitObj} onSend={(patch) => sendAirco(openUnitObj.id, patch)} onRefresh={() => mutateAirco()} />
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Zijaanzicht: links = voorkant (slaapkamer, zonnepanelen), rechts = achterkant (babykamer, ventilatie). Alle energie komt samen in de technische ruimte (het hart). Airco per verdieping — tik om te bedienen.
        </p>
      </div>
    </Section>
  );
}
