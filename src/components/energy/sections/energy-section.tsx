"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Section } from "../ui";
import { EC, fmtKwh, fmtW, fmtSigned, gd, gridColor, type HistPoint } from "@/lib/energy-format";
import { energyBars, bucketTickFmt, bucketSpanLabel, type EnergyBar, type Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function totals(bars: EnergyBar[]) {
  const opwek = bars.reduce((s, b) => s + b.opwek, 0);
  const verbruik = bars.reduce((s, b) => s + b.verbruik, 0);
  const net = bars.reduce((s, b) => s + b.net_import, 0);
  const injectie = -bars.reduce((s, b) => s + b.net_export, 0);
  const zelf = Math.max(0, verbruik - net);
  const zelf_pct = verbruik > 0 ? Math.round((zelf / verbruik) * 100) : null;
  return { opwek, verbruik, net, injectie, zelf, zelf_pct };
}

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

function BarTooltip({ active, payload, bucket }: { active?: boolean; payload?: Array<{ payload: EnergyBar }>; bucket: Range["bucket"] }) {
  if (!active || !payload?.[0]) return null;
  const b = payload[0].payload;
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold capitalize text-muted-foreground">{bucketSpanLabel(b.t, bucket)}</div>
      <div style={{ color: EC.solar }}>Opwek {fmtKwh(b.opwek, 2)} kWh</div>
      <div style={{ color: EC.house }}>Verbruik {fmtKwh(b.verbruik, 2)} kWh</div>
      <div style={{ color: EC.import }}>Afname {fmtKwh(b.net_import, 2)} kWh</div>
      <div style={{ color: EC.export }}>Injectie {fmtKwh(-b.net_export, 2)} kWh</div>
    </div>
  );
}

// ---- Live mode: rolling power lines (W) -------------------------------------
// batD is bat_w flipped so charging reads "up" (positive), discharging "down".
function LivePowerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HistPoint & { gridD: number; batD: number } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const time = new Date(d.t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{time}</div>
      <div style={{ color: EC.solar }}>Zon {fmtW(d.solar_w)}</div>
      <div style={{ color: gridColor(d.gridD) }}>Net {fmtSigned(d.gridD)}</div>
      <div style={{ color: EC.house }}>Verbruik {fmtW(d.house_w)}</div>
      <div style={{ color: EC.battery }}>Batterij {d.batD === 0 ? "0 W" : d.batD > 0 ? `laden ${fmtW(d.batD)}` : `ontladen ${fmtW(-d.batD)}`}</div>
    </div>
  );
}

// ---- Day mode: full-day power curve (W) -------------------------------------
// Same visual language as the live chart, but spanning 00:00→24:00. Raw history
// samples are averaged into 5-min buckets (see dayCurve) so a full day stays
// light for Recharts; gridD is the deadbanded net (>0 afname, <0 injectie).
interface DayPoint {
  t: number; // unix s — bucket midpoint
  solar_w: number;
  house_w: number;
  gridD: number;
}

const DAY_STEP = 300; // 5-min display buckets

function dayCurve(points: HistPoint[], dayStart: number): DayPoint[] {
  const acc = new Map<number, { n: number; solar: number; house: number; grid: number }>();
  for (const p of points) {
    const b = Math.floor((p.t - dayStart) / DAY_STEP);
    if (b < 0 || b >= 86400 / DAY_STEP) continue;
    const a = acc.get(b) ?? { n: 0, solar: 0, house: 0, grid: 0 };
    a.n += 1;
    a.solar += p.solar_w ?? 0;
    a.house += p.house_w ?? 0;
    a.grid += gd(p.grid_w ?? 0);
    acc.set(b, a);
  }
  return [...acc.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([b, a]) => ({
      t: dayStart + b * DAY_STEP + DAY_STEP / 2,
      solar_w: a.solar / a.n,
      house_w: a.house / a.n,
      gridD: a.grid / a.n,
    }));
}

function DayPowerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DayPoint }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const time = new Date(d.t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{time}</div>
      <div style={{ color: EC.solar }}>Zon {fmtW(d.solar_w)}</div>
      <div style={{ color: gridColor(d.gridD) }}>Net {fmtSigned(d.gridD)}</div>
      <div style={{ color: EC.house }}>Verbruik {fmtW(d.house_w)}</div>
    </div>
  );
}

export function EnergySection({ range }: { range: Range }) {
  const isLive = range.mode === "live";
  const isDay = range.mode === "day";
  const { data: hist } = useSWR<{ points: HistPoint[] }>(`/api/energy?start=${range.start}&end=${range.fetchEnd}`, fetcher, {
    refreshInterval: range.canNext ? 0 : isLive ? 3000 : 30000,
    keepPreviousData: true,
  });
  const points = useMemo(() => hist?.points ?? [], [hist]);

  const bars = useMemo(() => (isLive ? [] : energyBars(points, range)), [points, range, isLive]);
  const t = useMemo(() => totals(bars), [bars]);

  const tickFmt = bucketTickFmt(range.bucket);
  const interval = range.bucket === "hour" ? 1 : range.bucket === "day" ? (bars.length > 16 ? 2 : 0) : 0;
  const maxKwh = Math.max(0.5, ...bars.map((b) => Math.max(b.opwek, b.verbruik)));
  const netMax = Math.max(0.2, ...bars.map((b) => b.net_import));
  const netMin = Math.min(-0.2, ...bars.map((b) => b.net_export));

  // Live rolling power series. batD flips bat_w so charging reads "up".
  const livePts = useMemo(
    () => points.map((p) => ({ ...p, gridD: p.grid_w == null ? 0 : gd(p.grid_w), batD: p.bat_w == null ? 0 : -p.bat_w })),
    [points]
  );
  const gVals = livePts.map((p) => p.gridD);
  const gMax = Math.max(0, ...gVals, 10);
  const gMin = Math.min(0, ...gVals, -10);
  const goff = Math.min(1, Math.max(0, gMax / (gMax - gMin)));

  // Day curve series: 5-min averaged power over the full day, plus the gradient
  // zero-offset for the diverging net area (same trick as goff above).
  const dayPts = useMemo(() => (isDay ? dayCurve(points, range.start) : []), [isDay, points, range.start]);
  const dVals = dayPts.map((p) => p.gridD);
  const dMax = Math.max(0, ...dVals, 10);
  const dMin = Math.min(0, ...dVals, -10);
  const doff = Math.min(1, Math.max(0, dMax / (dMax - dMin)));
  const dayTicks = [0, 6, 12, 18, 24].map((h) => range.start + h * 3600);
  const dayTickFmt = (v: number) =>
    v >= range.end ? "24:00" : new Date(v * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });

  return (
    <Section
      title={isLive ? "Vermogen — live verloop" : isDay ? "Energie · " + range.label.toLowerCase() : "Energie per " + (range.bucket === "day" ? "dag" : "maand")}
      icon={BarChart3}
    >
      <div className="space-y-4">
        {isLive ? (
          <>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Net, opwek & batterij (laatste 30 min)</span>
              <span className="text-mini italic text-muted-foreground">net boven 0 = afname · onder 0 = injectie</span>
            </div>
            <div className="h-56 -mx-1 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={livePts} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="liveGridFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={goff} stopColor={EC.import} stopOpacity={0.4} />
                      <stop offset={goff} stopColor={EC.export} stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="liveGridStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={goff} stopColor={EC.import} />
                      <stop offset={goff} stopColor={EC.export} />
                    </linearGradient>
                    <linearGradient id="liveSolar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={EC.solar} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={EC.solar} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => new Date(v * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={40} />
                  <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <Tooltip content={<LivePowerTooltip />} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                  <Area type="linear" dataKey="solar_w" stroke={EC.solar} fill="url(#liveSolar)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="linear" dataKey="house_w" stroke={EC.house} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
                  <Area type="linear" dataKey="gridD" baseValue={0} stroke="url(#liveGridStroke)" fill="url(#liveGridFill)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="linear" dataKey="batD" stroke={EC.battery} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 text-mini text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.solar }} />zon</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.house }} />verbruik</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.import }} />net afname / <span className="inline-block h-1.5 w-3" style={{ background: EC.export }} />injectie</span>
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.battery }} />batterij (boven 0 = laden)</span>
            </div>
            <p className="text-mini text-muted-foreground">Kies een periode (Dag/Week/Maand/Jaar) hierboven om energie in kWh te zien. De live-tegels en flow staan bovenaan.</p>
          </>
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Total label="Opwek" value={`${fmtKwh(t.opwek)} kWh`} color={EC.solar} />
              <Total label="Verbruik" value={`${fmtKwh(t.verbruik)} kWh`} color={EC.house} />
              <Total label="Net afname" value={`${fmtKwh(t.net)} kWh`} color={EC.import} />
              <Total label="Injectie" value={`${fmtKwh(t.injectie)} kWh`} color={EC.export} />
              <Total label="Zelfvoorzienend" value={t.zelf_pct != null ? `${t.zelf_pct}%` : "—"} sub={`${fmtKwh(t.zelf)} kWh`} color={EC.self} />
            </div>

            {isDay ? (
              /* Day curve: same idiom as the live chart, spanning 00:00→24:00 */
              <>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Zon, verbruik & net (00:00–24:00)</span>
                  <span className="text-mini italic text-muted-foreground">net boven 0 = afname · onder 0 = injectie</span>
                </div>
                <div className="h-56 -mx-1 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dayPts} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id="dayGridFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={doff} stopColor={EC.import} stopOpacity={0.4} />
                          <stop offset={doff} stopColor={EC.export} stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="dayGridStroke" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={doff} stopColor={EC.import} />
                          <stop offset={doff} stopColor={EC.export} />
                        </linearGradient>
                        <linearGradient id="daySolar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={EC.solar} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={EC.solar} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="t" type="number" domain={[range.start, range.end]} ticks={dayTicks} tickFormatter={dayTickFmt} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                      <Tooltip content={<DayPowerTooltip />} />
                      <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                      <Area type="linear" dataKey="solar_w" stroke={EC.solar} fill="url(#daySolar)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                      <Line type="linear" dataKey="house_w" stroke={EC.house} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
                      <Area type="linear" dataKey="gridD" baseValue={0} stroke="url(#dayGridStroke)" fill="url(#dayGridFill)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-x-3 text-mini text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.solar }} />zon</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.house }} />verbruik</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.import }} />net afname / <span className="inline-block h-1.5 w-3" style={{ background: EC.export }} />injectie</span>
                </div>
              </>
            ) : (
              <>
                {/* Verbruik vs opwek */}
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Verbruik vs opwek</span>
                    <span className="flex gap-3 text-mini text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-3" style={{ background: EC.house }} />verbruik</span>
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-3" style={{ background: EC.solar }} />opwek</span>
                    </span>
                  </div>
                  <div className="h-44 -mx-1 sm:h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={bars} barGap={1} barCategoryGap="20%" margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                        <XAxis dataKey="t" tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={interval} />
                        <YAxis orientation="right" domain={[0, Math.ceil(maxKwh * 10) / 10]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                        <Tooltip content={<BarTooltip bucket={range.bucket} />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                        <Bar dataKey="verbruik" fill={EC.house} isAnimationActive={false} />
                        <Bar dataKey="opwek" fill={EC.solar} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Net diverging */}
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Net afname / injectie</span>
                    <span className="text-mini italic text-muted-foreground">rood boven = afname · roze onder = injectie</span>
                  </div>
                  <div className="h-36 -mx-1 sm:h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={bars} stackOffset="sign" margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                        <XAxis dataKey="t" tickFormatter={tickFmt} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={interval} />
                        <YAxis orientation="right" domain={[Math.floor(netMin * 10) / 10, Math.ceil(netMax * 10) / 10]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                        <Tooltip content={<BarTooltip bucket={range.bucket} />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                        <Bar dataKey="net_import" stackId="net" fill={EC.import} isAnimationActive={false} />
                        <Bar dataKey="net_export" stackId="net" fill={EC.export} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            <p className="text-mini text-muted-foreground">
              {isDay
                ? "Vermogen over de dag, gemiddeld per 5 minuten. De totalen hierboven zijn de dagtotalen in kWh; metingen gaan terug tot half mei."
                : `Energie per ${range.bucket === "day" ? "dag" : "maand"}, afgeleid uit het live vermogen. Metingen gaan terug tot half mei; verder terug is nog leeg en vult zich vanzelf aan.`}
            </p>
          </>
        )}
      </div>
    </Section>
  );
}
