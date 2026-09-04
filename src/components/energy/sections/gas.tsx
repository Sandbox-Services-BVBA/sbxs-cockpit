"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Flame } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, YAxis, XAxis, Tooltip, CartesianGrid } from "recharts";
import { Section, Metric } from "../ui";
import { daysToCover, pointsInRange, sumBy } from "@/lib/energy-house";
import { useHomeConsole } from "@/components/dashboard/home/home-console-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const REFRESH_MS = 60000; // the P1 gas register only ticks every ~5 min
const GAS = "#f97316";

interface GasPoint {
  d: string; // YYYY-MM-DD (local)
  m3: number;
  kwh: number;
  eur: number;
}
interface GasData {
  days: number;
  kwh_per_m3: number;
  price_ct_per_kwh: number;
  current_m3: number | null;
  points: GasPoint[];
  error?: string;
}

function fmt(n: number, d = 1) {
  return n.toLocaleString("nl-BE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Roll daily rows up to calendar months for the year view.
function toMonthly(points: GasPoint[]): GasPoint[] {
  const acc = new Map<string, GasPoint>();
  for (const p of points) {
    const key = `${p.d.slice(0, 7)}-01`;
    const cur = acc.get(key) ?? { d: key, m3: 0, kwh: 0, eur: 0 };
    cur.m3 += p.m3;
    cur.kwh += p.kwh;
    cur.eur += p.eur;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => a.d.localeCompare(b.d));
}

function GasTooltip({
  active,
  payload,
  monthly,
}: {
  active?: boolean;
  payload?: Array<{ payload: GasPoint }>;
  monthly: boolean;
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  const when = new Date(p.d).toLocaleDateString("nl-BE", monthly ? { month: "long", year: "numeric" } : { day: "2-digit", month: "long" });
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold capitalize text-muted-foreground">{when}</div>
      <div style={{ color: GAS }}>
        <span className="font-bold tabular-nums">{fmt(p.m3, 2)} m³</span>
      </div>
      <div className="tabular-nums text-muted-foreground">
        {fmt(p.kwh, 1)} kWh · € {fmt(p.eur, 2)}
      </div>
    </div>
  );
}

// Gas follows the global timeframe like every other period chart. The endpoint
// only speaks trailing `days`, so we over-fetch and clip to the selected range.
export function Gas() {
  const { range } = useHomeConsole();
  const days = daysToCover(range);
  const { data } = useSWR<GasData>(`/api/energy?gas=1&days=${days}`, fetcher, {
    refreshInterval: range.canNext ? 0 : REFRESH_MS,
    keepPreviousData: true,
  });

  const monthly = range.mode === "year";
  const inRange = useMemo(() => pointsInRange(data?.points, range), [data, range]);
  const points = useMemo(() => (monthly ? toMonthly(inRange) : inRange), [inRange, monthly]);

  const totalM3 = sumBy(inRange, (p) => p.m3);
  const totalKwh = sumBy(inRange, (p) => p.kwh);
  const totalEur = sumBy(inRange, (p) => p.eur);
  const usedDays = inRange.filter((p) => p.m3 > 0).length || 1;

  const xFmt = (d: string) =>
    monthly
      ? new Date(d).toLocaleDateString("nl-BE", { month: "short" })
      : new Date(d).toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit" });

  return (
    <Section
      title="Gas"
      icon={Flame}
      right={
        <span className="font-mono text-tiny text-muted-foreground">
          meterstand {data?.current_m3 != null ? `${fmt(data.current_m3, 2)} m³` : "—"}
        </span>
      }
    >
      {data?.error ? (
        <p className="text-petite text-[#ff4444]">Monitor: {data.error}</p>
      ) : !data ? (
        <p className="text-petite text-muted-foreground">Verbinden met energy-monitor...</p>
      ) : inRange.length === 0 ? (
        <p className="text-petite text-muted-foreground">Geen gasdata voor {range.label}.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label={`Totaal ${range.label}`} value={fmt(totalM3, 2)} unit="m³" color={GAS} sub={`${fmt(totalKwh, 0)} kWh`} />
            <Metric label="Gem./dag" value={fmt(totalM3 / usedDays, 2)} unit="m³" color={GAS} sub={`${fmt(totalKwh / usedDays, 1)} kWh`} />
            <Metric label="Kost" value={`€ ${fmt(totalEur, 2)}`} color={GAS} sub={`${fmt(data.price_ct_per_kwh, 2)} ct/kWh`} />
            <Metric label="Dagen" value={String(inRange.length)} color={GAS} sub={`${usedDays} met verbruik`} />
          </div>

          <div className="-mx-1 h-52 sm:h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis
                  dataKey="d"
                  tickFormatter={xFmt}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  orientation="right"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<GasTooltip monthly={monthly} />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Bar dataKey="m3" name="m³" fill={GAS} isAnimationActive={false} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-mini text-muted-foreground">
            Dagverbruik gas (m³) uit de P1-meter. kWh en € indicatief: {fmt(data.kwh_per_m3, 2)} kWh/m³ · {fmt(data.price_ct_per_kwh, 2)} ct/kWh.
          </p>
        </div>
      )}
    </Section>
  );
}
