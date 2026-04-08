"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Milestone {
  label: string;
  hours: number;
}

function buildMilestones(): Milestone[] {
  const m: Milestone[] = [];
  // First 2 months: every day
  for (let d = 1; d <= 60; d++) {
    m.push({ label: `${d} day${d > 1 ? "s" : ""}`, hours: d * 24 });
  }
  // 2-6 months: every week
  for (let w = 9; w <= 26; w++) {
    m.push({ label: `${w} weeks`, hours: w * 7 * 24 });
  }
  // 6+ months: every month
  for (let mo = 7; mo <= 24; mo++) {
    m.push({ label: `${mo} months`, hours: mo * 30 * 24 });
  }
  return m;
}

const MILESTONES = buildMilestones();

function getStreakInfo(startDate: string) {
  const start = new Date(startDate).getTime();
  const now = Date.now();
  const elapsedMs = now - start;
  const elapsedHours = elapsedMs / 3600000;

  // Find current and next milestone
  let current: Milestone | null = null;
  let next: Milestone | null = null;

  for (let i = 0; i < MILESTONES.length; i++) {
    if (elapsedHours >= MILESTONES[i].hours) {
      current = MILESTONES[i];
    } else {
      next = MILESTONES[i];
      break;
    }
  }

  // Progress toward next milestone
  const prevHours = current?.hours ?? 0;
  const nextHours = next?.hours ?? prevHours + 24;
  const progress = Math.min(100, ((elapsedHours - prevHours) / (nextHours - prevHours)) * 100);

  return { elapsedMs, elapsedHours, current, next, progress };
}

function LiveCounter({ startDate }: { startDate: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = now - new Date(startDate).getTime();
  const days = Math.floor(elapsed / 86400000);
  const hours = Math.floor((elapsed % 86400000) / 3600000);
  const mins = Math.floor((elapsed % 3600000) / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);

  return (
    <div className="font-mono text-lg font-bold tracking-tight tabular-nums">
      {days > 0 && <span>{days}<span className="text-xs text-muted-foreground ml-0.5 mr-1">d</span></span>}
      <span>{String(hours).padStart(2, "0")}</span>
      <span className="text-muted-foreground">:</span>
      <span>{String(mins).padStart(2, "0")}</span>
      <span className="text-muted-foreground">:</span>
      <span>{String(secs).padStart(2, "0")}</span>
    </div>
  );
}

export function SobrietyWidget() {
  const { data } = useSWR("/api/health", fetcher, { refreshInterval: 60000 });
  const sobriety = data?.sobriety;

  if (!sobriety) {
    return (
      <WidgetTile title="Sobriety Streak" size="sm">
        <p className="text-xs text-muted-foreground">
          {data === undefined ? "Loading..." : "Not started yet"}
        </p>
      </WidgetTile>
    );
  }

  const { current, next, progress } = getStreakInfo(sobriety.start_date);

  return (
    <WidgetTile title="Sobriety Streak" size="sm">
      <div className="space-y-2">
        <LiveCounter startDate={sobriety.start_date} />

        {next && (
          <div className="space-y-0.5">
            <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
              <span>{current?.label ?? "Start"}</span>
              <span>{next.label}</span>
            </div>
            <div className="h-2 bg-muted border border-border">
              <div className="h-full bg-[#33aa55]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {current && (
          <p className="text-[9px] text-[#33aa55] font-bold font-mono uppercase">
            Milestone: {current.label}
          </p>
        )}
      </div>
    </WidgetTile>
  );
}
