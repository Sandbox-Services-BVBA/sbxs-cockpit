"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Milestone {
  label: string;
  hours: number;
}

function buildMilestones(): Milestone[] {
  const m: Milestone[] = [];
  for (let d = 1; d <= 60; d++) {
    m.push({ label: `${d} day${d > 1 ? "s" : ""}`, hours: d * 24 });
  }
  for (let w = 9; w <= 26; w++) {
    m.push({ label: `${w} weeks`, hours: w * 7 * 24 });
  }
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

  return { elapsedMs, elapsedHours, current, next };
}

const RING_SIZE = 120;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ progress }: { progress: number }) {
  const offset = CIRCUMFERENCE * (1 - progress);
  return (
    <svg width={RING_SIZE} height={RING_SIZE} className="transform -rotate-90">
      {/* Background ring */}
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={STROKE_WIDTH}
      />
      {/* Progress ring */}
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--sbxs-green, #33aa55)"
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
}

function LiveRing({ startDate }: { startDate: string }) {
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

  // Ring fills up over 24h, resets each day
  const dayProgress = (elapsed % 86400000) / 86400000;

  const { current, next } = getStreakInfo(startDate);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Circle with day count inside */}
      <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <ProgressRing progress={dayProgress} />
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-3xl font-black tabular-nums leading-none">{days}</span>
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            {days === 1 ? "day" : "days"}
          </span>
        </div>
      </div>

      {/* Time counter below the ring */}
      <div className="font-mono text-xs text-muted-foreground tabular-nums">
        <span>{String(hours).padStart(2, "0")}</span>
        <span className="opacity-50">:</span>
        <span>{String(mins).padStart(2, "0")}</span>
        <span className="opacity-50">:</span>
        <span>{String(secs).padStart(2, "0")}</span>
      </div>

      {/* Next milestone */}
      {next && (
        <div className="text-center">
          <p className="text-[9px] font-mono text-muted-foreground">
            next: <span className="text-foreground font-bold">{next.label}</span>
          </p>
        </div>
      )}

      {/* Current milestone badge */}
      {current && (
        <div className="border border-[#33aa55]/30 bg-[#33aa55]/10 px-2 py-0.5">
          <p className="text-[9px] text-[#33aa55] font-bold font-mono uppercase tracking-wide">
            {current.label}
          </p>
        </div>
      )}
    </div>
  );
}

export function SobrietyWidget() {
  const { data } = useSWR("/api/health", fetcher, { refreshInterval: 60000 });
  const sobriety = data?.sobriety;

  if (!sobriety) {
    return (
      <WidgetTile title="Sobriety" size="sm">
        <p className="text-xs text-muted-foreground">
          {data === undefined ? "Loading..." : "Not started yet"}
        </p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile title="Sobriety" size="sm">
      <LiveRing startDate={sobriety.start_date} />
    </WidgetTile>
  );
}
