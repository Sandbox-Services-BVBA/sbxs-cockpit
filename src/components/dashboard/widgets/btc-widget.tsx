"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

const PERIODS = [
  { key: "1", label: "1D" },
  { key: "7", label: "7D" },
  { key: "30", label: "1M" },
  { key: "90", label: "3M" },
  { key: "365", label: "1Y" },
] as const;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { eur: number; usd: number; date: string } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border-2 border-border px-1.5 py-1 text-[9px] font-mono">
      <div>{d.date}</div>
      <div>EUR {d.eur.toLocaleString()}</div>
      <div className="text-muted-foreground">USD {d.usd?.toLocaleString()}</div>
    </div>
  );
}

export function BtcWidget() {
  const [days, setDays] = useState("30");
  const { data } = useSWR(`/api/btc?days=${days}`, fetcher, {
    refreshInterval: 600000,
    dedupingInterval: 60000,
    keepPreviousData: true,
  });

  const chart = data?.chart || [];
  const current = data?.current;
  const change = data?.change;
  const holdings = data?.holdings || 0;

  const allEur = chart.map((d: { eur: number }) => d.eur);
  const minEur = allEur.length > 0 ? Math.min(...allEur) - 500 : 0;
  const maxEur = allEur.length > 0 ? Math.max(...allEur) + 500 : 100000;

  return (
    <WidgetTile title="Bitcoin" size="md" headerRight={<span className="text-[9px] font-mono text-muted-foreground">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}>
      <div className="space-y-2">
        {/* Price + portfolio */}
        <div className="flex items-start justify-between">
          <div>
            {current ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] text-muted-foreground font-mono">USD</span>
                  <span className="text-xl font-black tabular-nums">{current.usd.toLocaleString()}</span>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  EUR {current.eur.toLocaleString()}
                </div>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">Loading...</span>
            )}
          </div>

          <div className="text-right">
            {current && (
              <>
                <div className="text-[11px] font-bold">
                  EUR {current.portfolioEur.toLocaleString()}
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  {holdings} BTC
                </div>
              </>
            )}
            {change && (
              <div className={cn(
                "text-[9px] font-mono",
                change.pct >= 0 ? "text-[#33aa55]" : "text-[#ff4444]"
              )}>
                {change.pct >= 0 ? "+" : ""}{change.pct}%
              </div>
            )}
          </div>
        </div>

        {/* Period toggles */}
        <div className="flex gap-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setDays(p.key)}
              className={cn(
                "flex-1 py-0.5 text-[9px] font-bold font-mono border-2 transition-colors",
                days === p.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:border-muted-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        {chart.length > 1 ? (
          <div className="h-20 -mx-0.5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 2, right: 2, bottom: 0, left: -24 }}>
                <YAxis
                  domain={[minEur, maxEur]}
                  tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={30}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="eur"
                  stroke="#f7931a"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 2, fill: "#f7931a" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-20 flex items-center justify-center text-[9px] text-muted-foreground">Loading chart...</div>
        )}
      </div>
    </WidgetTile>
  );
}
