"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { BatteryCharging } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Section } from "../ui";
import { cn } from "@/lib/utils";
import { useHomeConsole } from "@/components/dashboard/home/home-console-provider";
import { EC, fmtW, fmtKwh, type Battery, type HistPoint, type Live } from "@/lib/energy-format";
import { bucketSpanLabel, bucketTickFmt, type Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Charge/discharge accent pair — same green/amber the live chart gradient and
// the cell packet animation already use, so every mode reads the same.
const CHARGE = "#22c55e"; // groen — laden
const DISCHARGE = "#f59e0b"; // amber — ontladen

const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });

// Vertical battery cell with charge/discharge packet animation (cockpit style).
function Cell({ index, b }: { index: number; b: Battery }) {
  const charging = b.online && b.power_w < 0;
  const discharging = b.online && b.power_w > 0;
  const pct = Math.max(0, Math.min(100, b.soc ?? 0));
  const state = !b.online ? "offline" : charging ? "laden" : discharging ? "ontladen" : "idle";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-col items-center">
        <div className="h-2 w-6 bg-border" />
        <div className="relative h-28 w-14 overflow-hidden rounded-lg border border-border bg-muted/30">
          <div
            className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out", charging && "batt-glow")}
            style={{ height: `${pct}%`, background: b.online ? EC.battery : "#71717a" }}
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
        <div className="text-tiny font-mono text-muted-foreground">Batterij {index}</div>
        <div className="text-lg font-bold tabular-nums" style={{ color: EC.battery }}>
          {b.capacity_wh != null ? fmtKwh(b.capacity_wh / 1000) : "—"} kWh
        </div>
        <div className="text-tiny font-mono text-muted-foreground">
          {b.soc ?? "—"}% · {fmtKwh(b.rated_wh / 1000)} kWh
        </div>
        <div className="text-tiny font-mono" style={{ color: charging || discharging ? EC.battery : undefined }}>
          {state}
          {b.online && b.power_w !== 0 ? ` ${fmtW(Math.abs(b.power_w))}` : ""}
        </div>
      </div>
    </div>
  );
}

// ---- kWh per bucket from battery power history ------------------------------
// Local mirror of the calendar bucketing in energy-range.ts energyBars(),
// applied to bat_w: trapezoidal integration per bucket, split by sign.
// bat_w is + discharge / - charge, so the negative side is energy INTO the
// packs (laden) and the positive side energy OUT (ontladen). `ontladen` is
// stored negative so the chart can render diverging bars around 0, exactly
// like net_import/net_export in the energy section.
interface BatteryBar {
  t: number; // bucket start (unix s)
  laden: number; // kWh charged into the packs (>= 0)
  ontladen: number; // kWh discharged (<= 0, negative for diverging bars)
}

const secsOf = (d: Date) => Math.floor(d.getTime() / 1000);

function bucketStarts(range: Range): number[] {
  const out: number[] = [];
  if (range.bucket === "hour") {
    for (let t = range.start; t < range.end; t += 3600) out.push(t);
  } else if (range.bucket === "day") {
    const d = new Date(range.start * 1000);
    while (secsOf(d) < range.end) {
      out.push(secsOf(d));
      d.setDate(d.getDate() + 1);
    }
  } else if (range.bucket === "month") {
    const d = new Date(range.start * 1000);
    while (secsOf(d) < range.end) {
      out.push(secsOf(d));
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

function batteryBars(points: HistPoint[], range: Range): BatteryBar[] {
  const starts = bucketStarts(range);
  const bars: BatteryBar[] = starts.map((t) => ({ t, laden: 0, ontladen: 0 }));
  if (points.length < 2) return bars;

  const maxGap = range.bucket === "hour" ? 3600 : range.bucket === "day" ? 6 * 3600 : 3 * 86400;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > maxGap) continue; // skip gaps/back-steps
    const idx = bucketIndex(starts, (a.t + b.t) / 2);
    if (idx < 0 || idx >= bars.length) continue;
    const kwh = ((((a.bat_w ?? 0) + (b.bat_w ?? 0)) / 2) * (dt / 3600)) / 1000; // + uit, - in
    if (kwh < 0) bars[idx].laden -= kwh;
    else bars[idx].ontladen -= kwh; // stored negative
  }
  for (const bar of bars) {
    bar.laden = Math.round(bar.laden * 1000) / 1000;
    bar.ontladen = Math.round(bar.ontladen * 1000) / 1000;
  }
  return bars;
}

function batTotals(bars: BatteryBar[], ratedKwh: number) {
  const laden = bars.reduce((s, b) => s + b.laden, 0);
  const ontladen = -bars.reduce((s, b) => s + b.ontladen, 0); // positive kWh out
  const cycled = laden + ontladen;
  const cycles = ratedKwh > 0 ? cycled / 2 / ratedKwh : null;
  return { laden, ontladen, cycled, cycles };
}

// Small totals tile — same look as the Total tiles in the energy section.
function Total({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-border px-2.5 py-2">
      <div className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums leading-none sm:text-2xl" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-tiny text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ---- Tooltips ---------------------------------------------------------------
interface CurvePoint {
  t: number;
  bat: number | null; // W, flipped: + laden, - ontladen
  soc: number | null; // %
  stored_kwh: number | null;
}

function LiveTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CurvePoint }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const time = new Date(d.t * 1000).toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{time}</div>
      <div style={{ color: EC.battery }}>{d.bat == null ? "—" : d.bat >= 0 ? `Laden ${fmtW(d.bat)}` : `Ontladen ${fmtW(-d.bat)}`}</div>
      <div style={{ color: EC.battery }}>Lading {d.stored_kwh == null ? "—" : `${fmtKwh(d.stored_kwh)} kWh`}</div>
    </div>
  );
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CurvePoint }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{hhmm(d.t)}</div>
      <div style={{ color: EC.battery }}>{d.bat == null ? "—" : d.bat >= 0 ? `Laden ${fmtW(d.bat)}` : `Ontladen ${fmtW(-d.bat)}`}</div>
      <div style={{ color: EC.battery }}>SOC {d.soc == null ? "—" : `${Math.round(d.soc)}%`}</div>
    </div>
  );
}

function PeriodTooltip({ active, payload, bucket }: { active?: boolean; payload?: Array<{ payload: BatteryBar }>; bucket: Range["bucket"] }) {
  if (!active || !payload?.[0]) return null;
  const b = payload[0].payload;
  const net = b.laden + b.ontladen; // ontladen is negative
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold capitalize text-muted-foreground">{bucketSpanLabel(b.t, bucket)}</div>
      <div style={{ color: CHARGE }}>Geladen {fmtKwh(b.laden, 2)} kWh</div>
      <div style={{ color: DISCHARGE }}>Ontladen {fmtKwh(-b.ontladen, 2)} kWh</div>
      <div style={{ color: EC.battery }}>
        Netto {net >= 0 ? "+" : "−"}
        {fmtKwh(Math.abs(net), 2)} kWh
      </div>
    </div>
  );
}

// Batterij section, timeframe-aware: live = per-pack cells + rolling power,
// dag = SOC/power curve over the day, week/maand/jaar = kWh geladen vs
// ontladen per bucket as diverging bars (mirrors the energy-section bars).
export function Batteries() {
  const { live } = useHomeConsole();
  // The console only mounts modules once the feed is in, so this is a type
  // guard rather than a state; it also keeps the hooks below unconditional.
  if (!live) return null;
  return <BatteriesBody live={live} />;
}

function BatteriesBody({ live }: { live: Live }) {
  const { range, isLive } = useHomeConsole();
  const isDay = range.mode === "day";
  const { data: hist } = useSWR<{ points: HistPoint[] }>(`/api/energy?start=${range.start}&end=${range.fetchEnd}`, fetcher, {
    refreshInterval: range.canNext ? 0 : isLive ? 3000 : 30000,
    keepPreviousData: true,
  });
  const points = useMemo(() => hist?.points ?? [], [hist]);

  // Live + day curve. Flip battery sign so charging reads "up" (positive) like HomeWizard.
  const curve = useMemo<CurvePoint[]>(
    () =>
      isLive || isDay
        ? points.map((p) => ({
            t: p.t,
            bat: p.bat_w == null ? null : -p.bat_w,
            soc: p.soc_avg ?? null,
            stored_kwh: p.stored_wh == null ? null : Math.round(p.stored_wh / 100) / 10,
          }))
        : [],
    [points, isLive, isDay]
  );

  // Period buckets: kWh charged/discharged per hour/day/month.
  const bars = useMemo(() => (isLive ? [] : batteryBars(points, range)), [points, range, isLive]);
  const t = useMemo(() => batTotals(bars, live.rated_wh / 1000), [bars, live.rated_wh]);

  const storedKwh = fmtKwh(live.stored_wh / 1000);
  const ratedKwh = fmtKwh(live.rated_wh / 1000);
  const ratedNum = live.rated_wh / 1000;

  const tickFmt = bucketTickFmt(range.bucket);
  const interval = range.bucket === "day" && bars.length > 16 ? 2 : 0;
  const ladenMax = Math.max(0.2, ...bars.map((b) => b.laden));
  const ontladenMin = Math.min(-0.2, ...bars.map((b) => b.ontladen));

  const totalsRow = (
    <div className="grid grid-cols-3 gap-2">
      <Total label="Geladen" value={`${fmtKwh(t.laden)} kWh`} color={CHARGE} />
      <Total label="Ontladen" value={`${fmtKwh(t.ontladen)} kWh`} color={DISCHARGE} />
      <Total
        label="Gecycleerd"
        value={`${fmtKwh(t.cycled)} kWh`}
        sub={t.cycles != null ? `≈ ${fmtKwh(t.cycles)} volledige cycli` : undefined}
        color={EC.battery}
      />
    </div>
  );

  return (
    <Section
      title="Thuisbatterijen"
      icon={BatteryCharging}
      right={
        <span className="font-mono text-tiny text-muted-foreground">
          {isLive ? "" : "nu "}
          {storedKwh} / {ratedKwh} kWh · {live.soc_avg ?? "—"}%
        </span>
      }
    >
      {isLive ? (
        <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
          {/* Battery cells */}
          <div className="flex items-start justify-center gap-6 rounded-xl border border-border px-4 py-4 sm:gap-8">
            {live.batteries.map((b, i) => (
              <Cell key={b.ip} index={i + 1} b={b} />
            ))}
          </div>

          {/* Charge/discharge + stored charge chart */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Laden / ontladen · lading</span>
              <span className="text-mini italic text-muted-foreground">boven 0 = laden · onder 0 = ontladen</span>
            </div>
            <div className="h-48 -mx-1 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={curve} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="batArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHARGE} stopOpacity={0.4} />
                      <stop offset="50%" stopColor={EC.battery} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={DISCHARGE} stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickFormatter={hhmm}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis yAxisId="w" orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <YAxis yAxisId="kwh" orientation="left" domain={[0, Math.ceil(ratedNum)]} tick={{ fontSize: 8, fill: EC.battery }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip content={<LiveTooltip />} />
                  <ReferenceLine yAxisId="w" y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Area yAxisId="w" type="linear" dataKey="bat" baseValue={0} stroke={EC.battery} fill="url(#batArea)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                  <Line yAxisId="kwh" type="linear" dataKey="stored_kwh" stroke={EC.battery} strokeWidth={2} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-mini text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: CHARGE }} />laden</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: DISCHARGE }} />ontladen</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.battery }} />lading (kWh, stippellijn)</span>
            </div>
          </div>
        </div>
      ) : isDay ? (
        <div className="space-y-4">
          {totalsRow}

          {/* SOC + power curve over the day */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Vermogen & SOC over de dag</span>
              <span className="text-mini italic text-muted-foreground">boven 0 = laden · onder 0 = ontladen</span>
            </div>
            <div className="h-48 -mx-1 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={curve} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="batDayArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHARGE} stopOpacity={0.4} />
                      <stop offset="50%" stopColor={EC.battery} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={DISCHARGE} stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[range.start, range.end]}
                    ticks={[range.start, range.start + 21600, range.start + 43200, range.start + 64800, range.end]}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                    tickFormatter={hhmm}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis yAxisId="w" orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <YAxis yAxisId="soc" orientation="left" domain={[0, 100]} tick={{ fontSize: 8, fill: EC.battery }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip content={<DayTooltip />} />
                  <ReferenceLine yAxisId="w" y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Area yAxisId="w" type="linear" dataKey="bat" baseValue={0} stroke={EC.battery} fill="url(#batDayArea)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                  <Line yAxisId="soc" type="linear" dataKey="soc" stroke={EC.battery} strokeWidth={2} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-mini text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: CHARGE }} />laden</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: DISCHARGE }} />ontladen</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.battery }} />SOC (%, stippellijn)</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {totalsRow}

          {/* Diverging kWh bars per day/month */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">
                Geladen / ontladen per {range.bucket === "month" ? "maand" : "dag"}
              </span>
              <span className="text-mini italic text-muted-foreground">groen boven = geladen · amber onder = ontladen</span>
            </div>
            <div className="h-44 -mx-1 sm:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={bars} stackOffset="sign" margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis dataKey="t" tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={interval} />
                  <YAxis orientation="right" domain={[Math.floor(ontladenMin * 10) / 10, Math.ceil(ladenMax * 10) / 10]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<PeriodTooltip bucket={range.bucket} />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Bar dataKey="laden" stackId="bat" fill={CHARGE} isAnimationActive={false} />
                  <Bar dataKey="ontladen" stackId="bat" fill={DISCHARGE} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="text-mini text-muted-foreground">
            Batterij-energie per {range.bucket === "month" ? "maand" : "dag"} in kWh, afgeleid uit het gemeten laad- en ontlaadvermogen. Vóór de installatie (juni) is er niets te zien.
          </p>
        </div>
      )}
    </Section>
  );
}
