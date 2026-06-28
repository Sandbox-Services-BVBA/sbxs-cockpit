"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Droplet } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Section, Metric } from "../ui";
import { cn } from "@/lib/utils";
import type { Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const REFRESH_MS = 30000;
const WATER = "#3b82f6"; // blue (HomeWizard water hue)

interface WaterPoint {
  d: string; // YYYY-MM-DD
  m3: number;
  liter: number;
  eur: number;
}
interface WaterData {
  days: number;
  unit: string;
  price_eur_per_m3: number;
  current_m3: number | null;
  current_ts: number | null;
  flow_lpm: number | null;
  points: WaterPoint[];
  error?: string;
}

const fmt = (n: number, d = 1) => n.toLocaleString("nl-BE", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtVol = (liter: number) => (liter >= 1000 ? `${fmt(liter / 1000, 2)} m³` : `${fmt(liter, 0)} L`);

// Water history is per-day ("last N days") only, so the timeframe maps to a day
// count. Live/Dag show a recent window for context (a single day is not a graph);
// Jaar aggregates the days into months.
function daysFor(range: Range): number {
  switch (range.mode) {
    case "live":
    case "day":
      return 14;
    case "week":
      return 7;
    case "month":
      return Math.max(28, Math.round((range.end - range.start) / 86400));
    case "year":
      return 366;
  }
}

function toMonthly(points: WaterPoint[]): WaterPoint[] {
  const by = new Map<string, WaterPoint>();
  for (const p of points) {
    const key = p.d.slice(0, 7); // YYYY-MM
    const cur = by.get(key) ?? { d: `${key}-01`, m3: 0, liter: 0, eur: 0 };
    cur.m3 += p.m3;
    cur.liter += p.liter;
    cur.eur += p.eur;
    by.set(key, cur);
  }
  return Array.from(by.values()).sort((a, b) => a.d.localeCompare(b.d));
}

function WaterTooltip({ active, payload, monthly }: { active?: boolean; payload?: Array<{ payload: WaterPoint }>; monthly: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const label = monthly
    ? new Date(p.d).toLocaleDateString("nl-BE", { month: "long", year: "numeric" })
    : new Date(p.d).toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="space-y-0.5 border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold capitalize text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2" style={{ color: WATER }}>
        <span className="inline-block h-1.5 w-3" style={{ background: WATER }} />
        <span className="flex-1">Water</span>
        <span className="font-bold tabular-nums">{fmtVol(p.liter)}</span>
      </div>
      <div className="tabular-nums text-muted-foreground">{fmt(p.m3, 3)} m³ · € {fmt(p.eur, 2)}</div>
    </div>
  );
}

export function Water({ range }: { range: Range }) {
  const days = daysFor(range);
  const { data } = useSWR<WaterData>(`/api/energy?water=1&days=${days}`, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
  });

  const monthly = range.mode === "year";
  const raw = useMemo(() => data?.points ?? [], [data]);
  const points = useMemo(() => (monthly ? toMonthly(raw) : raw), [raw, monthly]);

  const today = raw.length ? raw[raw.length - 1] : null;
  const totalLiter = raw.reduce((s, p) => s + p.liter, 0);
  const totalEur = raw.reduce((s, p) => s + p.eur, 0);
  const usedDays = raw.filter((p) => p.liter > 0).length || 1;
  const avgLiter = totalLiter / usedDays;
  const flowing = (data?.flow_lpm ?? 0) > 0;

  const xFmt = (d: string) =>
    monthly
      ? new Date(d).toLocaleDateString("nl-BE", { month: "short" })
      : new Date(d).toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit" });

  return (
    <Section
      title="Water"
      icon={Droplet}
      right={
        <span className="flex items-center gap-1.5 font-mono text-tiny text-muted-foreground">
          <Droplet className={cn("h-3.5 w-3.5", flowing && "animate-pulse")} style={{ color: WATER }} />
          {flowing ? `${fmt(data?.flow_lpm ?? 0, 1)} l/min` : `meterstand ${data?.current_m3 != null ? `${fmt(data.current_m3, 3)} m³` : "—"}`}
        </span>
      }
    >
      {data?.error ? (
        <p className="text-petite text-[#ff4444]">Monitor: {data.error}</p>
      ) : !data ? (
        <p className="text-petite text-muted-foreground">Verbinden met energy-monitor...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Vandaag" value={today ? fmt(today.liter, 0) : "—"} unit="L" color={WATER} sub={today ? `€ ${fmt(today.eur, 2)}` : undefined} />
            <Metric label="Gem./dag" value={fmt(avgLiter, 0)} unit="L" color={WATER} sub={`${fmt(avgLiter / 1000, 3)} m³`} />
            <Metric label={`Totaal ${days}d`} value={fmtVol(totalLiter)} color={WATER} sub={`${fmt(totalLiter / 1000, 2)} m³`} />
            <Metric label={`Kost ${days}d`} value={`€ ${fmt(totalEur, 2)}`} color={WATER} sub={`${fmt(data.price_eur_per_m3, 2)} €/m³`} />
          </div>

          <div className="h-52 -mx-1 sm:h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="d" tickFormatter={xFmt} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}`} />
                <Tooltip content={<WaterTooltip monthly={monthly} />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Bar dataKey="liter" name="L" fill={WATER} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-mini text-muted-foreground">
            Dagverbruik water (liter) uit de HomeWizard watermeter{range.mode === "live" || range.mode === "day" ? " — laatste 14 dagen (water heeft geen uurdata)" : ""}. € indicatief: {fmt(data.price_eur_per_m3, 2)} €/m³ (De Watergroep). Metingen starten eind juni en vullen zich aan.
          </p>
        </div>
      )}
    </Section>
  );
}
