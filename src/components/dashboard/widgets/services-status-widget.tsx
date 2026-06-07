"use client";

import { useEffect, useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { Service } from "@/types";

function tsOf(iso: string): number {
  return new Date(iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z").getTime();
}

function fmtDuration(secs: number): string {
  if (!secs || secs < 0) return "";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

function beatAgo(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  return fmtDuration(Math.round((nowMs - tsOf(iso)) / 1000));
}

export function ServicesWidget({ services }: { services?: Service[] | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  if (!services) {
    return (
      <WidgetTile title="Services" size="lg">
        <p className="text-xs text-muted-foreground">Waiting for agent...</p>
      </WidgetTile>
    );
  }

  // Down first, then alphabetical.
  const sorted = [...services].sort(
    (a, b) => Number(!!a.running) - Number(!!b.running) || a.name.localeCompare(b.name)
  );
  const up = services.filter((s) => s.running).length;

  return (
    <WidgetTile
      title="Services"
      size="lg"
      headerRight={
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {up}/{services.length} up
        </span>
      }
    >
      <table className="w-full table-fixed font-mono text-[10px] leading-snug">
        <colgroup>
          <col className="w-3" />
          <col className="w-32" />
          <col />
        </colgroup>
        <tbody>
          {sorted.map((s) => {
            const running = !!s.running;
            const beat = beatAgo(s.last_beat, now);
            return (
              <tr key={s.name}>
                <td className="align-top">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      running ? "bg-emerald-500" : "bg-red-500"
                    )}
                  />
                </td>
                <td className="truncate pr-2" title={s.detail ?? ""}>
                  {s.name}
                </td>
                <td className="truncate text-right text-muted-foreground" title={s.detail ?? ""}>
                  {running ? (
                    <>
                      {s.uptime_seconds ? `up ${fmtDuration(s.uptime_seconds)}` : "running"}
                      {beat && <span className="text-emerald-400/70"> · {beat}</span>}
                    </>
                  ) : (
                    <span className="text-red-400 font-bold">DOWN</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </WidgetTile>
  );
}
