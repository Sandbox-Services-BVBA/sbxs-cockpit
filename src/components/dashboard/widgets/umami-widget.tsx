"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Trend({ current, previous }: { current: number; previous: number }) {
  if (current === previous) return null;
  const up = current > previous;
  return (
    <span className={cn("text-[9px] font-mono flex items-center gap-0.5", up ? "text-[#33aa55]" : "text-[#ff4444]")}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? "+" : ""}{current - previous}
    </span>
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
        <p className="text-[11px] text-muted-foreground">{data === undefined ? "Loading..." : "No data"}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black tabular-nums">{today.visitors}</span>
            <span className="text-[9px] text-muted-foreground font-mono">TODAY</span>
            <Trend current={today.visitors} previous={today.comparison?.visitors ?? today.visitors} />
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between text-[9px] font-mono">
              <span className="text-muted-foreground">VIEWS</span>
              <span>{today.pageviews}</span>
            </div>
            <div className="flex justify-between text-[9px] font-mono">
              <span className="text-muted-foreground">BOUNCES</span>
              <span>{today.bounces}</span>
            </div>
            {week && (
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-muted-foreground">WEEK</span>
                <span>{week.visitors} visitors</span>
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetTile>
  );
}
