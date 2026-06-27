"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Section } from "../ui";
import {
  EC,
  fmtKwh,
  fmtEur,
  dayWindow,
  dayLabel,
  hourlyBars,
  type HistPoint,
  type HourBar,
  type SummaryData,
  type SummaryPoint,
} from "@/lib/energy-format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function hourFmt(t: number) {
  return new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit" });
}

// Totals derived from the hourly bars themselves so the headline numbers always
// match what the chart shows for the selected day.
function totalsFromBars(bars: HourBar[]) {
  const opwek = bars.reduce((s, b) => s + b.opwek, 0);
  const verbruik = bars.reduce((s, b) => s + b.verbruik, 0);
  const net = bars.reduce((s, b) => s + b.net_import, 0);
  const injectie = -bars.reduce((s, b) => s + b.net_export, 0); // export stored negative
  const zelf = Math.max(0, verbruik - net);
  const zelf_pct = verbruik > 0 ? Math.round((zelf / verbruik) * 100) : null;
  return { opwek, verbruik, net, injectie, zelf, zelf_pct };
}

function Total({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="border-2 border-border px-2.5 py-2">
      <div className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums leading-none sm:text-2xl" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-tiny text-muted-foreground">{sub}</div>}
    </div>
  );
}

interface BarTip {
  active?: boolean;
  payload?: Array<{ payload: HourBar }>;
}
function HourTooltip({ active, payload }: BarTip) {
  if (!active || !payload?.[0]) return null;
  const b = payload[0].payload;
  const from = new Date(b.hour * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  const to = new Date((b.hour + 3600) * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-0.5 border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{from}–{to}</div>
      <div style={{ color: EC.solar }}>Opwek {fmtKwh(b.opwek, 2)} kWh</div>
      <div style={{ color: EC.house }}>Verbruik {fmtKwh(b.verbruik, 2)} kWh</div>
      <div style={{ color: EC.import }}>Afname {fmtKwh(b.net_import, 2)} kWh</div>
      <div style={{ color: EC.export }}>Injectie {fmtKwh(-b.net_export, 2)} kWh</div>
    </div>
  );
}

export function DayView() {
  const [offset, setOffset] = useState(0);
  const { start, end } = dayWindow(offset);

  const { data: hist } = useSWR<{ points: HistPoint[] }>(`/api/energy?start=${start}&end=${end}`, fetcher, {
    refreshInterval: offset === 0 ? 30000 : 0,
    keepPreviousData: true,
  });
  // Summary covers enough days to find the selected one (for the indicative €).
  const sumDays = Math.min(31, Math.abs(offset) + 1);
  const { data: summary } = useSWR<SummaryData>(`/api/energy?summary=1&days=${sumDays}`, fetcher, {
    refreshInterval: offset === 0 ? 60000 : 0,
    keepPreviousData: true,
  });

  const bars = useMemo(() => hourlyBars(hist?.points ?? [], start), [hist, start]);
  const totals = useMemo(() => totalsFromBars(bars), [bars]);

  const dateStr = new Date(start * 1000).toISOString().slice(0, 10);
  const sumPoint: SummaryPoint | undefined = summary?.points?.find((p) => p.d === dateStr);
  const kosten = sumPoint?.kosten;

  // Y domain for the consumption/production grouped chart.
  const maxKwh = Math.max(0.5, ...bars.map((b) => Math.max(b.opwek, b.verbruik)));
  const netMax = Math.max(0.2, ...bars.map((b) => b.net_import));
  const netMin = Math.min(-0.2, ...bars.map((b) => b.net_export));

  return (
    <Section
      title="Dagoverzicht"
      icon={BarChart3}
      right={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="border-2 border-border p-1 text-muted-foreground hover:text-foreground"
            aria-label="Vorige dag"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[120px] text-center text-petite font-bold capitalize tabular-nums text-foreground">
            {dayLabel(offset, start)}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="border-2 border-border p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Volgende dag"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Totals — the HomeWizard "Vandaag" row */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Total label="Opwek" value={`${fmtKwh(totals.opwek)} kWh`} color={EC.solar} />
          <Total label="Verbruik" value={`${fmtKwh(totals.verbruik)} kWh`} sub={kosten != null ? fmtEur(kosten) : undefined} color={EC.house} />
          <Total label="Net afname" value={`${fmtKwh(totals.net)} kWh`} color={EC.import} />
          <Total label="Injectie" value={`${fmtKwh(totals.injectie)} kWh`} color={EC.export} />
          <Total label="Zelfvoorzienend" value={totals.zelf_pct != null ? `${totals.zelf_pct}%` : "—"} sub={`${fmtKwh(totals.zelf)} kWh`} color={EC.self} />
        </div>

        {/* Hourly: verbruik vs opwek */}
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Verbruik vs opwek (per uur)</span>
            <span className="flex gap-3 text-mini text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3" style={{ background: EC.house }} />verbruik</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3" style={{ background: EC.solar }} />opwek</span>
            </span>
          </div>
          <div className="h-44 -mx-1 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={bars} barGap={1} barCategoryGap="20%" margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="hour" tickFormatter={hourFmt} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={1} />
                <YAxis orientation="right" domain={[0, Math.ceil(maxKwh * 10) / 10]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}`} />
                <Tooltip content={<HourTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Bar dataKey="verbruik" fill={EC.house} isAnimationActive={false} />
                <Bar dataKey="opwek" fill={EC.solar} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly: net afname / injectie (diverging) */}
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Net per uur</span>
            <span className="text-mini italic text-muted-foreground">rood boven = afname · roze onder = injectie</span>
          </div>
          <div className="h-36 -mx-1 sm:h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={bars} margin={{ top: 4, right: 0, bottom: 0, left: 4 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="hour" tickFormatter={hourFmt} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={1} />
                <YAxis orientation="right" domain={[Math.floor(netMin * 10) / 10, Math.ceil(netMax * 10) / 10]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<HourTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                <Bar dataKey="net_import" stackId="net" fill={EC.import} isAnimationActive={false} />
                <Bar dataKey="net_export" stackId="net" fill={EC.export} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <p className="text-mini text-muted-foreground">
          Per-uur energie afgeleid uit het live vermogen. Volledige dagen kloppen met de HomeWizard-tellers; vandaag telt mee tot nu.
        </p>
      </div>
    </Section>
  );
}
