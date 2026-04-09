"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SiteData {
  today: number;
  pageviews: number;
  daily: { date: string; visitors: number }[];
  euVisitors: number;
  topCountries: { country: string; visitors: number }[];
}

function DayBar({ value, max }: { value: number; max: number }) {
  const height = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      <div className="w-full h-10 flex items-end">
        <div
          className="w-full bg-chart-1"
          style={{ height: `${height}%` }}
        />
      </div>
      <span className="text-[8px] font-mono text-muted-foreground">{value || ""}</span>
    </div>
  );
}

function WeekChart({ daily }: { daily: { date: string; visitors: number }[] }) {
  const max = Math.max(...daily.map(d => d.visitors), 1);
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="space-y-0.5">
      <div className="flex gap-px">
        {daily.map((d, i) => (
          <DayBar key={d.date} value={d.visitors} max={max} />
        ))}
      </div>
      <div className="flex gap-px">
        {daily.map((d, i) => {
          const dayName = new Date(d.date).toLocaleDateString("en", { weekday: "short" }).slice(0, 2);
          return (
            <div key={d.date} className="flex-1 text-center text-[7px] font-mono text-muted-foreground">
              {dayName}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UmamiWidget({ site, title }: { site: "plaqstudio" | "bookyourbox"; title: string }) {
  const { data } = useSWR("/api/umami", fetcher, { refreshInterval: 900000, dedupingInterval: 60000 });

  const siteData = data?.[site] as SiteData | null | undefined;

  return (
    <WidgetTile title={title} size="sm">
      {!siteData ? (
        <p className="text-[11px] text-muted-foreground">{data === undefined ? "Loading..." : "No data"}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black tabular-nums">{siteData.today}</span>
            <span className="text-[9px] text-muted-foreground font-mono">TODAY</span>
            <span className="text-[9px] text-muted-foreground font-mono ml-auto">EU {siteData.euVisitors}/wk</span>
          </div>

          <WeekChart daily={siteData.daily} />

          {siteData.topCountries.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {siteData.topCountries.map(c => (
                <span key={c.country} className="text-[8px] font-mono text-muted-foreground">
                  {c.country} {c.visitors}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </WidgetTile>
  );
}
