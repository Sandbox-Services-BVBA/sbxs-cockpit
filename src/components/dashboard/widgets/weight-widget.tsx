"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function WeightWidget() {
  const { data } = useSWR("/api/health", fetcher, { refreshInterval: 60000 });
  const weights = data?.weights as { weight_kg: number; recorded_at: string }[] | undefined;

  if (!weights || weights.length === 0) {
    return (
      <WidgetTile title="Weight" size="sm">
        <p className="text-xs text-muted-foreground">
          {data === undefined ? "Loading..." : (
            <a href="/api/fitbit/auth" className="text-primary hover:underline">Connect Fitbit</a>
          )}
        </p>
      </WidgetTile>
    );
  }

  const latest = weights[0];
  const previous = weights[1];
  const oldest = weights[weights.length - 1];
  const diff = previous ? latest.weight_kg - previous.weight_kg : 0;
  const totalDiff = latest.weight_kg - oldest.weight_kg;

  // Mini sparkline using CSS
  const min = Math.min(...weights.map((w) => w.weight_kg));
  const max = Math.max(...weights.map((w) => w.weight_kg));
  const range = max - min || 1;

  return (
    <WidgetTile title="Weight" size="sm">
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight">{latest.weight_kg.toFixed(1)}</span>
          <span className="text-[10px] text-muted-foreground">kg</span>
          {diff !== 0 && (
            <span className={cn("text-xs flex items-center gap-0.5", diff < 0 ? "text-emerald-400" : "text-red-400")}>
              {diff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {Math.abs(diff).toFixed(1)}
            </span>
          )}
        </div>

        {/* Mini sparkline */}
        <div className="flex items-end gap-px h-8">
          {weights.slice(0, 14).reverse().map((w, i) => (
            <div
              key={i}
              className="flex-1 bg-chart-2 rounded-t-sm min-h-[2px] opacity-70"
              style={{ height: `${((w.weight_kg - min) / range) * 100}%` }}
            />
          ))}
        </div>

        {weights.length > 1 && (
          <p className={cn("text-[10px]", totalDiff <= 0 ? "text-emerald-400" : "text-muted-foreground")}>
            {totalDiff <= 0 ? "" : "+"}{totalDiff.toFixed(1)} kg over {weights.length} entries
          </p>
        )}
      </div>
    </WidgetTile>
  );
}
