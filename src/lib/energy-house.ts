// Aggregation helpers for the house hero widget.
//
// Two awkward facts about the upstream energy-monitor shape drive this file:
//  1. Battery throughput is not in `energyBars` — only solar/house/grid are. So
//     charge and discharge kWh get their own integrator over `bat_w`.
//  2. The gas and water endpoints take a trailing `days=N` window, not a
//     start/end range. To show a past period we over-fetch and filter by local
//     calendar date on this side.
// Pure functions only — no React.

import { gd, type HistPoint } from "./energy-format";
import type { Range } from "./energy-range";

// ---- Battery throughput ----------------------------------------------------

export interface BatteryEnergy {
  charged: number; // kWh into the battery over the range
  discharged: number; // kWh out of the battery over the range
  socStart: number | null;
  socEnd: number | null;
}

// Same trapezoid + gap-rejection approach as energyBars(), so a logging outage
// undercounts rather than inventing a flat line across the hole.
export function batteryEnergy(points: HistPoint[], range: Range): BatteryEnergy {
  const inRange = points.filter((p) => p.t >= range.start && p.t <= range.fetchEnd);
  const empty: BatteryEnergy = { charged: 0, discharged: 0, socStart: null, socEnd: null };
  if (inRange.length < 2) return empty;

  const maxGap = range.bucket === "hour" || range.bucket === "minute" ? 3600 : range.bucket === "day" ? 6 * 3600 : 3 * 86400;
  let charged = 0;
  let discharged = 0;

  for (let i = 1; i < inRange.length; i++) {
    const a = inRange[i - 1];
    const b = inRange[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > maxGap) continue;
    const hours = dt / 3600;
    // bat_w is + on discharge, - on charge.
    const avg = ((a.bat_w ?? 0) + (b.bat_w ?? 0)) / 2;
    if (avg < 0) charged += (-avg * hours) / 1000;
    else discharged += (avg * hours) / 1000;
  }

  return {
    charged: Math.round(charged * 1000) / 1000,
    discharged: Math.round(discharged * 1000) / 1000,
    socStart: inRange[0].soc_avg ?? null,
    socEnd: inRange[inRange.length - 1].soc_avg ?? null,
  };
}

// ---- Trailing-window day series (gas + water) ------------------------------

// How many trailing days to request so the window reaches back past range.start.
// Capped at 400 to keep the year view from asking for silly amounts.
export function daysToCover(range: Range): number {
  const spanDays = Math.ceil((Date.now() / 1000 - range.start) / 86400) + 1;
  return Math.max(7, Math.min(400, spanDays));
}

// Local YYYY-MM-DD for a unix timestamp — daily points are keyed by local date,
// so comparing them as strings avoids a UTC-vs-local off-by-one day.
function localDay(ts: number): string {
  const d = new Date(ts * 1000);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DayPoint {
  d: string;
}

// Keep only the daily points that fall inside the selected period. The end is
// clamped to today so an in-progress period doesn't look like it has future days.
export function pointsInRange<T extends DayPoint>(points: T[] | undefined, range: Range): T[] {
  if (!points?.length) return [];
  const from = localDay(range.start);
  const to = localDay(Math.min(range.end - 1, Math.floor(Date.now() / 1000)));
  return points.filter((p) => p.d >= from && p.d <= to);
}

export function sumBy<T>(items: T[], pick: (item: T) => number | null | undefined): number {
  return items.reduce((total, item) => total + (pick(item) ?? 0), 0);
}

// ---- Money -----------------------------------------------------------------

export interface SummaryPoint {
  d: string;
  kosten: number; // indicative € for electricity that day; negative = net earner
}

export interface EnergyCost {
  power: number; // € electricity (net of injection revenue)
  gas: number;
  water: number;
  total: number;
}

// What the period actually cost. Electricity comes from the daily summary the
// bridge already prices; gas and water carry their own € per day. All three are
// indicative — tariffs are flat-rate approximations, not a real invoice.
export function energyCost(
  summary: SummaryPoint[] | undefined,
  gasEur: number,
  waterEur: number,
  range: Range
): EnergyCost {
  const power = sumBy(pointsInRange(summary, range), (p) => p.kosten);
  return {
    power: Math.round(power * 100) / 100,
    gas: Math.round(gasEur * 100) / 100,
    water: Math.round(waterEur * 100) / 100,
    total: Math.round((power + gasEur + waterEur) * 100) / 100,
  };
}

// ---- Grid + solar + house totals for the range -----------------------------

export interface PeriodTotals {
  solar: number; // kWh produced
  house: number; // kWh consumed
  gridImport: number; // kWh bought
  gridExport: number; // kWh sold (positive number)
  selfPct: number | null; // share of consumption covered without the grid
}

// Integrated straight from power history rather than energyBars, so the hero
// stays correct even when the range is a single bucket (year view).
export function periodTotals(points: HistPoint[], range: Range): PeriodTotals {
  const inRange = points.filter((p) => p.t >= range.start && p.t <= range.fetchEnd);
  const empty: PeriodTotals = { solar: 0, house: 0, gridImport: 0, gridExport: 0, selfPct: null };
  if (inRange.length < 2) return empty;

  const maxGap = range.bucket === "hour" || range.bucket === "minute" ? 3600 : range.bucket === "day" ? 6 * 3600 : 3 * 86400;
  let solar = 0;
  let house = 0;
  let gridImport = 0;
  let gridExport = 0;

  for (let i = 1; i < inRange.length; i++) {
    const a = inRange[i - 1];
    const b = inRange[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > maxGap) continue;
    const hours = dt / 3600;
    const avg = (p: number, q: number) => ((p ?? 0) + (q ?? 0)) / 2;
    solar += (avg(a.solar_w, b.solar_w) * hours) / 1000;
    house += (avg(a.house_w, b.house_w) * hours) / 1000;
    const g = avg(gd(a.grid_w), gd(b.grid_w));
    if (g >= 0) gridImport += (g * hours) / 1000;
    else gridExport += (-g * hours) / 1000;
  }

  const self = Math.max(0, house - gridImport);
  return {
    solar: Math.round(solar * 100) / 100,
    house: Math.round(house * 100) / 100,
    gridImport: Math.round(gridImport * 100) / 100,
    gridExport: Math.round(gridExport * 100) / 100,
    selfPct: house > 0.05 ? Math.round((self / house) * 100) : null,
  };
}
