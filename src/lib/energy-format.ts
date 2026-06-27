// Shared formatting + data-shaping for the Energy page (/energy).
// Pure functions only — no React. The legacy energy widget keeps its own copy;
// this file is the single source for the new page so sections stay consistent.

// ---- Colour tokens (match the legacy widget so both pages read the same) ----
export const EC = {
  solar: "#f59e0b", // amber — opwek
  import: "#ef4444", // red — net afname (drawing from grid)
  export: "#ec4899", // pink — net injectie (returning to grid)
  battery: "#06b6d4", // cyan — batterij
  house: "#64748b", // slate — verbruik
  self: "#22c55e", // green — zelfvoorzienend / good
  supply: "#06b6d4", // cyan — inblaas
  extract: "#f59e0b", // amber — retour
} as const;

// The battery balances the grid CT to ~0; it hunts ±20-50 W around zero. Snap
// that near-zero noise to 0 for DISPLAY only (logged data stays raw).
export const GRID_DEADBAND = 40;
export const gd = (w: number) => (Math.abs(w) < GRID_DEADBAND ? 0 : w);

// Grid colour: red when drawing from grid (>= 0), pink when injecting (< 0).
export const gridColor = (w: number) => (w >= 0 ? EC.import : EC.export);

export function fmtW(w: number | null | undefined): string {
  if (w == null) return "—";
  const a = Math.abs(w);
  if (a >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
}
export function fmtSigned(w: number | null | undefined): string {
  if (w == null) return "—";
  if (Math.round(w) === 0) return "0 W";
  return (w > 0 ? "+" : "−") + fmtW(Math.abs(w));
}
export function fmtKwh(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return n.toLocaleString("nl-BE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtEur(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}€ ${Math.abs(n).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---- Live snapshot types (mirror /api/live) ---------------------------------
export interface Battery {
  ip: string;
  online: boolean;
  soc: number | null;
  power_w: number; // + discharge, - charge
  temp_c: number | null;
  capacity_wh: number | null;
  rated_wh: number;
  vbat?: number | null;
  mode: string | null;
}
export interface Live {
  ts: number;
  grid_w: number; // + afname (import), - injectie (export)
  solar_w: number;
  bat_w: number; // + discharge, - charge
  house_w: number;
  soc_avg: number | null;
  stored_wh: number;
  rated_wh: number;
  batteries: Battery[];
  grid?: {
    monthly_peak_w?: number;
    tariff?: number;
    gas_m3?: number;
    voltage_l1_v?: number;
    voltage_l2_v?: number;
    voltage_l3_v?: number;
    power_l1_w?: number;
    power_l2_w?: number;
    power_l3_w?: number;
  };
  solar?: { total_yield_kwh?: number | null };
  error?: string;
}

export interface HistPoint {
  t: number;
  grid_w: number;
  solar_w: number;
  bat_w: number;
  house_w: number;
  soc_avg: number;
  stored_wh: number;
}

export interface SummaryPoint {
  d: string;
  opwek: number; // solar produced (kWh)
  verbruik: number; // house consumption (kWh)
  net: number; // grid import (kWh)
  injectie: number; // grid export (kWh)
  zelf: number; // self-consumed (kWh)
  zelf_pct: number | null;
  kosten: number; // indicative € (energy only)
}
export interface SummaryData {
  days: number;
  points: SummaryPoint[];
  elec_day_ct?: number;
  elec_night_ct?: number;
  error?: string;
}

// ---- Plain-language verdict (the novice "tell me in words") -----------------
export function statusLine(live: Live): { text: string; good: boolean } {
  const buying = gd(live.grid_w) > 0;
  const selling = gd(live.grid_w) < 0;
  const charging = live.bat_w < -60;
  const discharging = live.bat_w > 60;
  const sun = live.solar_w > 120;
  if (buying)
    return { text: discharging ? "Je koopt van het net — de batterij helpt mee." : "Je koopt stroom van het net.", good: false };
  if (selling)
    return { text: charging ? "Overschot: de batterij laadt én je verkoopt aan het net." : "Je verkoopt je overschot aan het net.", good: true };
  if (sun && charging) return { text: "De zon dekt je huis en laadt de batterij. Je koopt niets.", good: true };
  if (sun) return { text: "De zon dekt je huis. Je koopt niets van het net.", good: true };
  if (discharging) return { text: "De batterij voedt je huis. Je koopt niets van het net.", good: true };
  return { text: "In balans — nauwelijks uitwisseling met het net.", good: true };
}

// ---- Day window helpers -----------------------------------------------------
export function dayWindow(offset: number): { start: number; end: number } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const start = Math.floor(d.getTime() / 1000) + offset * 86400;
  return { start, end: start + 86400 };
}
export function dayLabel(offset: number, start: number): string {
  if (offset === 0) return "Vandaag";
  if (offset === -1) return "Gisteren";
  return new Date(start * 1000).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });
}

// ---- Hourly energy bars (the HomeWizard "dag" view) -------------------------
// History gives instantaneous power samples (W). Integrate them into per-hour
// energy (kWh) so we can draw HomeWizard-style hourly bars. Trapezoidal sum of
// power over each [hour, hour+1) bucket; samples are ~ every few seconds so this
// tracks the cumulative meters closely.
export interface HourBar {
  hour: number; // unix seconds at the start of the hour
  opwek: number; // solar produced (kWh)
  verbruik: number; // house consumed (kWh)
  net_import: number; // drawn from grid (kWh, >= 0)
  net_export: number; // returned to grid (kWh, <= 0, stored negative for diverging bars)
}

export function hourlyBars(points: HistPoint[], dayStart: number): HourBar[] {
  // Pre-seed 24 buckets so the chart always shows a full day axis.
  const bars: HourBar[] = Array.from({ length: 24 }, (_, h) => ({
    hour: dayStart + h * 3600,
    opwek: 0,
    verbruik: 0,
    net_import: 0,
    net_export: 0,
  }));
  if (points.length < 2) return bars;

  const add = (h: number, key: "opwek" | "verbruik" | "net_import" | "net_export", wh: number) => {
    if (h < 0 || h > 23) return;
    bars[h][key] += wh / 1000;
  };

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > 3600) continue; // skip gaps/back-steps
    const mid = (a.t + b.t) / 2;
    const h = Math.floor((mid - dayStart) / 3600);
    const hours = dt / 3600;
    const avg = (p: number, q: number) => ((p ?? 0) + (q ?? 0)) / 2;

    add(h, "opwek", avg(a.solar_w, b.solar_w) * hours);
    add(h, "verbruik", avg(a.house_w, b.house_w) * hours);

    const g = avg(gd(a.grid_w), gd(b.grid_w));
    if (g >= 0) add(h, "net_import", g * hours);
    else add(h, "net_export", g * hours); // negative
  }
  // Round to avoid 0.0001 noise rendering as ghost bars.
  for (const bar of bars) {
    bar.opwek = Math.round(bar.opwek * 1000) / 1000;
    bar.verbruik = Math.round(bar.verbruik * 1000) / 1000;
    bar.net_import = Math.round(bar.net_import * 1000) / 1000;
    bar.net_export = Math.round(bar.net_export * 1000) / 1000;
  }
  return bars;
}
