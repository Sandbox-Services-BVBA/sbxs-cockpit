"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { TrendingDown, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";

const PERIODS = [
  { key: "2m", label: "2M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "5y", label: "5Y" },
] as const;

type Period = (typeof PERIODS)[number]["key"];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { weight_kg: number; date: string } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-md px-2 py-1 text-xs shadow-lg">
      <span className="font-semibold">{d.weight_kg.toFixed(1)} kg</span>
      <span className="text-muted-foreground ml-1.5">{d.date}</span>
    </div>
  );
}

export function WeightWidget() {
  const [period, setPeriod] = useState<Period>("2m");
  const { data } = useSWR(`/api/health?period=${period}`, fetcher, {
    refreshInterval: 300000,
    dedupingInterval: 30000,
    keepPreviousData: true,
  });

  const weights = data?.weights as { weight_kg: number; recorded_at: string }[] | undefined;
  const todayWeight = data?.todayWeight as { weight_kg: number } | undefined;
  const totalCount = data?.totalCount as number | undefined;

  // No data at all
  if (data !== undefined && (!weights || weights.length === 0) && !todayWeight) {
    return (
      <WidgetTile title="Weight" size="md">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">No weight data yet.</p>
          <a href="/api/fitbit/auth" className="text-xs text-primary hover:underline">Connect Fitbit</a>
        </div>
      </WidgetTile>
    );
  }

  // Prepare chart data
  const chartData = (weights || []).map((w) => ({
    weight_kg: w.weight_kg,
    date: new Date(w.recorded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }),
    ts: new Date(w.recorded_at).getTime(),
  }));

  const latestWeight = todayWeight?.weight_kg ?? (weights && weights.length > 0 ? weights[weights.length - 1].weight_kg : null);
  const firstWeight = weights && weights.length > 0 ? weights[0].weight_kg : null;
  const diff = latestWeight && firstWeight ? latestWeight - firstWeight : null;

  // Y-axis domain with padding
  const allValues = chartData.map((d) => d.weight_kg);
  const minW = allValues.length > 0 ? Math.floor(Math.min(...allValues) - 1) : 70;
  const maxW = allValues.length > 0 ? Math.ceil(Math.max(...allValues) + 1) : 100;

  // Average for reference line
  const avg = allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : null;

  return (
    <WidgetTile title="Weight" size="md">
      <div className="space-y-3">
        {/* Big number + period toggles */}
        <div className="flex items-start justify-between">
          <div>
            {latestWeight ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight">{latestWeight.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">kg</span>
                {diff !== null && diff !== 0 && (
                  <span className={cn(
                    "text-xs flex items-center gap-0.5 ml-1",
                    diff < 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {diff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Loading...</span>
            )}
            {todayWeight && <p className="text-[10px] text-muted-foreground">today</p>}
            {!todayWeight && latestWeight && <p className="text-[10px] text-muted-foreground">latest</p>}
          </div>

          {/* Period toggles */}
          <div className="flex gap-0.5 bg-muted/50 rounded-md p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                  period === p.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Line chart */}
        {chartData.length > 1 ? (
          <div className="h-28 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <YAxis
                  domain={[minW, maxW]}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip content={<CustomTooltip />} />
                {avg && (
                  <ReferenceLine
                    y={avg}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="3 3"
                    strokeOpacity={0.3}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight_kg"
                  stroke="var(--sbxs-coral)"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: "var(--sbxs-coral)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : chartData.length === 1 ? (
          <p className="text-xs text-muted-foreground h-28 flex items-center justify-center">Only 1 entry in this period</p>
        ) : (
          <p className="text-xs text-muted-foreground h-28 flex items-center justify-center">No data for this period</p>
        )}

        {/* Footer stats */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{chartData.length} entries</span>
          {totalCount !== undefined && totalCount > chartData.length && (
            <span>{totalCount} total stored</span>
          )}
        </div>
      </div>
    </WidgetTile>
  );
}
