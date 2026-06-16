"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { ResponsiveContainer, AreaChart, Area, YAxis, ReferenceLine, Tooltip } from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Metric {
  group: string;
  key: string;
  label: string;
  value: number | string | boolean | null;
  unit: string;
  note?: string;
}
interface RawResp {
  ts: number;
  age_s: number;
  metrics: Metric[];
  error?: string;
}
interface HistPoint {
  t: number;
  grid_w: number;
}

const GROUP_COLOR: Record<string, string> = {
  "Net (P1)": "#ef4444",
  "Zon (SMA)": "#f59e0b",
  Afgeleid: "#64748b",
};
const groupColor = (g: string) => GROUP_COLOR[g] ?? "#06b6d4"; // batteries = blue

function fmtVal(v: Metric["value"]): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "ja" : "nee";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("nl-BE") : v.toFixed(1);
  return String(v);
}

function GridTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HistPoint }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const t = new Date(d.t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="border border-border bg-popover px-2 py-1 text-tiny shadow-lg">
      <span className="text-muted-foreground">{t}</span> · {d.grid_w >= 0 ? "afname " : "injectie "}
      {Math.abs(d.grid_w)} W
    </div>
  );
}

export function RawMetricsWidget() {
  const { data } = useSWR<RawResp>("/api/energy?raw=1", fetcher, { refreshInterval: 3000, keepPreviousData: true });
  const { data: hist } = useSWR<{ points: HistPoint[] }>("/api/energy?hours=2", fetcher, { refreshInterval: 15000, keepPreviousData: true });

  if (data?.error) {
    return (
      <WidgetTile title="Live metrics" size="lg">
        <p className="text-tiny text-[#ff4444]">Monitor: {data.error}</p>
      </WidgetTile>
    );
  }
  if (!data?.metrics) {
    return (
      <WidgetTile title="Live metrics" size="lg">
        <p className="text-tiny text-muted-foreground">Verbinden met energy-monitor...</p>
      </WidgetTile>
    );
  }

  // group metrics in registry order of first appearance
  const groups: { name: string; rows: Metric[] }[] = [];
  for (const m of data.metrics) {
    let g = groups.find((x) => x.name === m.group);
    if (!g) { g = { name: m.group, rows: [] }; groups.push(g); }
    g.rows.push(m);
  }
  const points = hist?.points ?? [];

  return (
    <WidgetTile
      title="Live metrics"
      size="lg"
      headerRight={<span className="text-nano font-mono text-muted-foreground">{data.age_s}s geleden · {data.metrics.length}</span>}
    >
      <div className="space-y-2">
        {/* Grid usage over time — plateaus near 0 while the battery covers the house */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Net verloop (2u)</span>
            <span className="text-nano italic text-muted-foreground">boven 0 = afname · onder 0 = injectie</span>
          </div>
          {points.length > 1 ? (
            <div className="h-20 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                  <Tooltip content={<GridTooltip />} />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
                  <Area type="linear" dataKey="grid_w" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="flex h-20 items-center justify-center text-tiny text-muted-foreground">grafiek vult zich...</p>
          )}
        </div>

        {/* Raw metric table, grouped */}
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-border pt-2 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="mb-0.5 text-tiny font-bold uppercase tracking-wide" style={{ color: groupColor(g.name) }}>{g.name}</div>
              <div className="space-y-0">
                {g.rows.map((m) => (
                  <div key={m.key} className="flex items-baseline justify-between gap-2 border-b border-border/40 py-0.5">
                    <span className="text-tiny text-muted-foreground truncate" title={m.note}>{m.label}</span>
                    <span className="shrink-0 text-tiny font-bold tabular-nums">
                      {fmtVal(m.value)}
                      <span className="ml-0.5 font-normal text-muted-foreground">{m.unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetTile>
  );
}
