"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { ResponsiveContainer, AreaChart, Area, YAxis, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; balance: number } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border-2 border-border px-1.5 py-1 text-[9px] font-mono">
      <div>{d.date}</div>
      <div>EUR {d.balance.toLocaleString()}</div>
    </div>
  );
}

export function BankWidget() {
  const { data } = useSWR("/api/bank", fetcher, {
    refreshInterval: 300000,
    dedupingInterval: 60000,
  });

  const balance = data?.balance;
  const chart = data?.chart || [];

  const allBal = chart.map((d: { balance: number }) => d.balance);
  const minBal = allBal.length > 0 ? Math.min(...allBal) - 1000 : 0;
  const maxBal = allBal.length > 0 ? Math.max(...allBal) + 1000 : 30000;

  return (
    <WidgetTile title="Bank Account" size="md">
      <div className="space-y-2">
        {/* Balance */}
        <div className="flex items-start justify-between">
          <div>
            {balance ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-[9px] text-muted-foreground font-mono">EUR</span>
                  <span className="text-xl font-black tabular-nums">{balance.currentBalance.toLocaleString()}</span>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  as of {balance.asOf}
                </div>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">Loading...</span>
            )}
          </div>

          {balance?.thisMonth && (
            <div className="text-right space-y-0.5">
              <div className="text-[9px] font-mono">
                <span className="text-[#33aa55]">+{balance.thisMonth.income.toLocaleString()}</span>
              </div>
              <div className="text-[9px] font-mono">
                <span className="text-[#ff4444]">{balance.thisMonth.expenses.toLocaleString()}</span>
              </div>
              <div className={cn("text-[9px] font-mono font-bold", balance.thisMonth.net >= 0 ? "text-[#33aa55]" : "text-[#ff4444]")}>
                {balance.thisMonth.net >= 0 ? "+" : ""}{balance.thisMonth.net.toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        {chart.length > 1 ? (
          <div className="h-28 -mx-0.5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 2, right: 2, bottom: 0, left: -24 }}>
                <YAxis
                  domain={[minBal, maxBal]}
                  tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={28}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="var(--sbxs-blue-light)"
                  fill="var(--sbxs-blue-light)"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-28 flex items-center justify-center text-[9px] text-muted-foreground">Loading chart...</div>
        )}
      </div>
    </WidgetTile>
  );
}
