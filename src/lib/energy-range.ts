// Global timeframe model for the Energy page. One Range drives every section so
// all charts show the same window. Built from a (mode, offset) pair: mode picks
// the granularity, offset steps backward/forward by one unit (0 = current).
//
// Energy bars (kWh) are derived by integrating the power-history samples into
// calendar buckets — this works back ~6 weeks (as far as power logging goes),
// independent of the daily-counter summary which only started 2026-06-26.

import { gd, type HistPoint } from "./energy-format";

export type TFMode = "live" | "day" | "week" | "month" | "year";
export type Bucket = "minute" | "hour" | "day" | "month";

export interface Range {
  mode: TFMode;
  start: number; // unix s — period start
  end: number; // unix s — period end (may be in the future for the current period)
  fetchEnd: number; // end clamped to "now" for fetching/axis
  bucket: Bucket;
  label: string;
  canNext: boolean; // false when already at the current period
}

export const TF_OPTIONS: { value: TFMode; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "day", label: "Dag" },
  { value: "week", label: "Week" },
  { value: "month", label: "Maand" },
  { value: "year", label: "Jaar" },
];

const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
// Monday-based week start.
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}
const secs = (d: Date) => Math.floor(d.getTime() / 1000);

export function buildRange(mode: TFMode, offset: number): Range {
  const now = Math.floor(Date.now() / 1000);
  const today = new Date();

  if (mode === "live") {
    return { mode, start: now - 1800, end: now, fetchEnd: now, bucket: "minute", label: "Live · 30 min", canNext: false };
  }

  let start: number, end: number, bucket: Bucket, label: string;

  if (mode === "day") {
    const d = startOfDay(today);
    d.setDate(d.getDate() + offset);
    start = secs(d);
    end = start + 86400;
    bucket = "hour";
    label = offset === 0 ? "Vandaag" : offset === -1 ? "Gisteren" : new Date(start * 1000).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });
  } else if (mode === "week") {
    const d = startOfWeek(today);
    d.setDate(d.getDate() + offset * 7);
    start = secs(d);
    const e = new Date(d);
    e.setDate(e.getDate() + 7);
    end = secs(e);
    bucket = "day";
    const endLabel = new Date((end - 86400) * 1000);
    label = offset === 0 ? "Deze week" : `${new Date(start * 1000).toLocaleDateString("nl-BE", { day: "numeric", month: "short" })} – ${endLabel.toLocaleDateString("nl-BE", { day: "numeric", month: "short" })}`;
  } else if (mode === "month") {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    start = secs(d);
    end = secs(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    bucket = "day";
    label = `${MONTHS_NL[d.getMonth()]} ${d.getFullYear()}`;
  } else {
    // year
    const d = new Date(today.getFullYear() + offset, 0, 1);
    start = secs(d);
    end = secs(new Date(d.getFullYear() + 1, 0, 1));
    bucket = "month";
    label = `${d.getFullYear()}`;
  }

  return { mode, start, end, fetchEnd: Math.min(end, now), bucket, label, canNext: end <= now };
}

// ---- Energy bars (kWh per bucket) from power history ------------------------
export interface EnergyBar {
  t: number; // bucket start (unix s)
  opwek: number; // solar produced (kWh)
  verbruik: number; // house consumed (kWh)
  net_import: number; // from grid (kWh, >= 0)
  net_export: number; // to grid (kWh, <= 0)
}

// Calendar bucket boundaries for the range. Day/hour buckets are fixed-width;
// month buckets walk real calendar months (handles 28-31 day months).
function bucketStarts(range: Range): number[] {
  const out: number[] = [];
  if (range.bucket === "hour") {
    for (let t = range.start; t < range.end; t += 3600) out.push(t);
  } else if (range.bucket === "day") {
    const d = new Date(range.start * 1000);
    while (secs(d) < range.end) {
      out.push(secs(d));
      d.setDate(d.getDate() + 1);
    }
  } else if (range.bucket === "month") {
    const d = new Date(range.start * 1000);
    while (secs(d) < range.end) {
      out.push(secs(d));
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    out.push(range.start);
  }
  return out;
}

function bucketIndex(starts: number[], t: number): number {
  // starts is ascending; find the last start <= t.
  let lo = 0,
    hi = starts.length - 1,
    idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return idx;
}

export function energyBars(points: HistPoint[], range: Range): EnergyBar[] {
  const starts = bucketStarts(range);
  const bars: EnergyBar[] = starts.map((t) => ({ t, opwek: 0, verbruik: 0, net_import: 0, net_export: 0 }));
  if (points.length < 2) return bars;

  const maxGap = range.bucket === "hour" ? 3600 : range.bucket === "day" ? 6 * 3600 : 3 * 86400;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > maxGap) continue; // skip gaps/back-steps
    const mid = (a.t + b.t) / 2;
    const idx = bucketIndex(starts, mid);
    if (idx < 0 || idx >= bars.length) continue;
    const hours = dt / 3600;
    const avg = (p: number, q: number) => ((p ?? 0) + (q ?? 0)) / 2;
    bars[idx].opwek += (avg(a.solar_w, b.solar_w) * hours) / 1000;
    bars[idx].verbruik += (avg(a.house_w, b.house_w) * hours) / 1000;
    const g = avg(gd(a.grid_w), gd(b.grid_w));
    if (g >= 0) bars[idx].net_import += (g * hours) / 1000;
    else bars[idx].net_export += (g * hours) / 1000; // negative
  }
  for (const bar of bars) {
    bar.opwek = Math.round(bar.opwek * 1000) / 1000;
    bar.verbruik = Math.round(bar.verbruik * 1000) / 1000;
    bar.net_import = Math.round(bar.net_import * 1000) / 1000;
    bar.net_export = Math.round(bar.net_export * 1000) / 1000;
  }
  return bars;
}

// X-axis tick label for a bucket start, given the range bucket.
export function bucketTickFmt(bucket: Bucket): (t: number) => string {
  switch (bucket) {
    case "hour":
      return (t) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit" });
    case "day":
      return (t) => new Date(t * 1000).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
    case "month":
      return (t) => new Date(t * 1000).toLocaleDateString("nl-BE", { month: "short" });
    default:
      return (t) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  }
}

// Tooltip label for a single bucket (its span).
export function bucketSpanLabel(t: number, bucket: Bucket): string {
  const d = new Date(t * 1000);
  if (bucket === "hour") {
    const to = new Date((t + 3600) * 1000);
    return `${d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}–${to.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (bucket === "day") return d.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "long" });
  if (bucket === "month") return d.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
  return d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
}
