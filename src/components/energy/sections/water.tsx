"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Droplet, Waves } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Section, Metric } from "../ui";
import { cn } from "@/lib/utils";
import type { Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const REFRESH_MS = 30000;
const WATER = "#3b82f6"; // blue (HomeWizard water hue)
const WELL = "#10b981"; // emerald — days the well pump ran (toilets on well water)

interface WaterPoint {
  d: string; // YYYY-MM-DD
  m3: number;
  liter: number;
  eur: number;
  well?: number | null; // fraction of the day the well pump ran (null = not logged)
}
interface WaterData {
  days: number;
  unit: string;
  price_eur_per_m3: number;
  current_m3: number | null;
  current_ts: number | null;
  flow_lpm: number | null;
  well_running?: boolean | null;
  well_since?: number | null;
  points: WaterPoint[];
  error?: string;
}

const fmt = (n: number, d = 1) => n.toLocaleString("nl-BE", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtVol = (liter: number) => (liter >= 1000 ? `${fmt(liter / 1000, 2)} m³` : `${fmt(liter, 0)} L`);

const isWellDay = (p: WaterPoint) => (p.well ?? 0) >= 0.5;

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
  const color = !monthly && isWellDay(p) ? WELL : WATER;
  return (
    <div className="space-y-0.5 border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold capitalize text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2" style={{ color }}>
        <span className="inline-block h-1.5 w-3" style={{ background: color }} />
        <span className="flex-1">Water</span>
        <span className="font-bold tabular-nums">{fmtVol(p.liter)}</span>
      </div>
      <div className="tabular-nums text-muted-foreground">{fmt(p.m3, 3)} m³ · € {fmt(p.eur, 2)}</div>
      {!monthly && p.well != null && p.well > 0 && (
        <div style={{ color: WELL }}>putpomp aan ({Math.round(p.well * 100)}% van de dag)</div>
      )}
    </div>
  );
}

// Inline pump toggle — mirrors the sobriety-widget pattern: one click opens a
// small confirm form with an optional backdate, POST goes through the cockpit
// proxy to energy-monitor.
function PumpControl({ running, since, onLogged }: { running: boolean | null | undefined; since: number | null | undefined; onLogged: () => void }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const next = !(running ?? false);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const body: { running: boolean; ts?: number } = { running: next };
      if (when) body.ts = Math.floor(new Date(when).getTime() / 1000);
      const res = await fetch("/api/energy/well", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOpen(false);
      setWhen("");
      onLogged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-2 border-border px-3 py-2">
      <span className="flex items-center gap-2 text-petite font-bold">
        <Waves className="h-4 w-4" style={{ color: running ? WELL : "var(--muted-foreground)" }} />
        Putpomp{" "}
        {running == null ? (
          <span className="text-muted-foreground">nog niet gelogd</span>
        ) : (
          <span style={{ color: running ? WELL : undefined }}>{running ? "AAN" : "UIT"}</span>
        )}
      </span>
      {since != null && (
        <span className="text-tiny text-muted-foreground">
          sinds {new Date(since * 1000).toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {open && (
          <>
            <input
              type="datetime-local"
              value={when}
              max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={(e) => setWhen(e.target.value)}
              className="border-2 border-border bg-transparent px-2 py-0.5 text-tiny text-foreground"
              title="Optioneel: wanneer je de pomp echt omzette (leeg = nu)"
            />
            <button
              onClick={submit}
              disabled={busy}
              className="border-2 border-primary bg-primary px-2.5 py-0.5 text-tiny font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
            >
              {busy ? "..." : "Bevestig"}
            </button>
            <button
              onClick={() => { setOpen(false); setErr(null); }}
              className="border-2 border-border px-2.5 py-0.5 text-tiny font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Annuleer
            </button>
          </>
        )}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="border-2 border-border px-2.5 py-0.5 text-tiny font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            Markeer {next ? "aan" : "uit"}
          </button>
        )}
      </div>
      {err && <span className="w-full text-tiny text-[#ff4444]">Loggen mislukt: {err}</span>}
    </div>
  );
}

export function Water({ range }: { range: Range }) {
  const days = daysFor(range);
  const { data, mutate } = useSWR<WaterData>(`/api/energy?water=1&days=${days}`, fetcher, {
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

  // Well vs city comparison over COMPLETE days (today is partial, skip it).
  // A day counts as a well-day when the pump ran at least half the day.
  const cmp = useMemo(() => {
    const done = raw.slice(0, -1).filter((p) => p.liter > 0);
    const wellDays = done.filter((p) => isWellDay(p));
    const cityDays = done.filter((p) => !isWellDay(p));
    if (!wellDays.length || !cityDays.length) return null;
    const wellAvg = wellDays.reduce((s, p) => s + p.liter, 0) / wellDays.length;
    const cityAvg = cityDays.reduce((s, p) => s + p.liter, 0) / cityDays.length;
    const saved = cityAvg - wellAvg;
    return { wellAvg, cityAvg, saved, pct: cityAvg > 0 ? (saved / cityAvg) * 100 : 0, nWell: wellDays.length, nCity: cityDays.length };
  }, [raw]);

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
          <PumpControl running={data.well_running} since={data.well_since} onLogged={() => mutate()} />

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
                <Bar dataKey="liter" name="L" fill={WATER} isAnimationActive={false}>
                  {points.map((p) => (
                    <Cell key={p.d} fill={!monthly && isWellDay(p) ? WELL : WATER} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {cmp && (
            <div className="border-2 px-3 py-2 text-petite" style={{ borderColor: WELL }}>
              <b style={{ color: WELL }}>Putwater-effect:</b> gem. <b>{fmt(cmp.wellAvg, 0)} L/dag</b> met pomp aan ({cmp.nWell}d) tegenover{" "}
              <b>{fmt(cmp.cityAvg, 0)} L/dag</b> zonder ({cmp.nCity}d)
              {cmp.saved > 0 ? (
                <>
                  {" "}— besparing <b>{fmt(cmp.saved, 0)} L/dag ({fmt(cmp.pct, 0)}%)</b>, ~€ {fmt((cmp.saved / 1000) * data.price_eur_per_m3 * 365, 0)}/jaar aan
                  stadswater.
                </>
              ) : (
                <> — nog geen meetbare besparing.</>
              )}
            </div>
          )}

          <p className="text-mini text-muted-foreground">
            Dagverbruik stadswater (liter) uit de HomeWizard watermeter{range.mode === "live" || range.mode === "day" ? " — laatste 14 dagen (water heeft geen uurdata)" : ""}.{" "}
            <span style={{ color: WELL }}>Groene balken</span> = dagen waarop de putpomp draaide (toiletten op putwater); markeer aan/uit hierboven bij elke fysieke
            omschakeling. € indicatief: {fmt(data.price_eur_per_m3, 2)} €/m³ (De Watergroep).
          </p>
        </div>
      )}
    </Section>
  );
}
