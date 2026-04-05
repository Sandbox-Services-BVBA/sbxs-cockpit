"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  if (current > previous) return <TrendingUp className="h-3 w-3 text-emerald-400" />;
  if (current < previous) return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function StatRow({ label, value, prev }: { label: string; value?: number; prev?: number }) {
  if (value === undefined) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold">{value.toLocaleString()}</span>
        {prev !== undefined && <TrendIcon current={value} previous={prev} />}
      </div>
    </div>
  );
}

export function UmamiWidget({ site, title }: { site: "plaqstudio" | "bookyourbox"; title: string }) {
  const { data } = useSWR("/api/umami", fetcher, { refreshInterval: 900000, dedupingInterval: 60000 });

  const siteData = data?.[site];
  const today = siteData?.today;
  const week = siteData?.week;

  return (
    <WidgetTile title={title} size="sm">
      {!today ? (
        <p className="text-xs text-muted-foreground">{data === undefined ? "Loading..." : "Not configured"}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight">{today.visitors.value}</span>
            <span className="text-[10px] text-muted-foreground">today</span>
          </div>
          <StatRow label="Pageviews" value={today.pageviews.value} prev={today.pageviews.prev} />
          <StatRow label="This week" value={week?.visitors?.value} prev={week?.visitors?.prev} />
        </div>
      )}
    </WidgetTile>
  );
}
