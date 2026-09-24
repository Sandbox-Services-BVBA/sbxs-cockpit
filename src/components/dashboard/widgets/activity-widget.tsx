"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { ModuleDensity } from "@/lib/layout/types";

const REFRESH_MS = 45000;
const FETCH_LIMIT = 250;
const ROWS: Record<ModuleDensity, number> = { summary: 8, standard: 16, full: 40 };

interface ActivityEvent {
  id: number;
  ts: string;
  service: string;
  event: string;
  severity: "info" | "warn" | "error";
  summary: string;
  detail: Record<string, unknown> | null;
  source: string;
}

interface ActivityService {
  service: string;
  last: string;
  count24h: number;
  errors24h: number;
  lastError: string | null;
}

// One visual row: an event, plus how many consecutive near-identical events
// it stands for. 1440 near-identical heartbeats a day must not bury the four
// lines that matter, so consecutive events with the same service + event +
// severity collapse into their newest occurrence with a multiplier.
interface FeedRow {
  head: ActivityEvent;
  count: number;
  firstTs: string;
}

function collapse(events: ActivityEvent[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const e of events) {
    const prev = rows[rows.length - 1];
    if (
      prev &&
      prev.head.service === e.service &&
      prev.head.event === e.event &&
      prev.head.severity === e.severity
    ) {
      prev.count += 1;
      prev.firstTs = e.ts;
    } else {
      rows.push({ head: e, count: 1, firstTs: e.ts });
    }
  }
  return rows;
}

function fmtAge(iso: string, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

// runlog summaries lead with "<service>: " — redundant next to the service
// column, so drop it.
function cleanSummary(e: ActivityEvent): string {
  const prefix = `${e.service}: `;
  return e.summary.startsWith(prefix) ? e.summary.slice(prefix.length) : e.summary;
}

function dotClass(severity: string): string {
  if (severity === "error") return "bg-red-500";
  if (severity === "warn") return "bg-amber-500";
  return "bg-emerald-500/60";
}

export function ActivityWidget({ density = "standard" }: { density?: ModuleDensity }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [services, setServices] = useState<ActivityService[]>([]);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (service: string) => {
    try {
      const qs = new URLSearchParams({ limit: String(FETCH_LIMIT) });
      if (service) qs.set("service", service);
      const [feedRes, svcRes] = await Promise.all([
        fetch(`/api/activity?${qs}`, { cache: "no-store" }),
        fetch(`/api/activity/services`, { cache: "no-store" }),
      ]);
      if (!feedRes.ok || !svcRes.ok) throw new Error(`HTTP ${feedRes.status || svcRes.status}`);
      const feed = await feedRes.json();
      const svc = await svcRes.json();
      setEvents(feed.events ?? []);
      setServices(svc.services ?? []);
      setErr("");
    } catch {
      setErr("Activity feed unreachable");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load(filter);
    });
    const t = setInterval(() => void load(filter), REFRESH_MS);
    const c = setInterval(() => setNow(Date.now()), 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(c);
    };
  }, [load, filter]);

  const rows = useMemo(() => collapse(events).slice(0, ROWS[density]), [events, density]);
  const withErrors = services.filter((s) => s.errors24h > 0);
  const active24h = services.filter((s) => s.count24h > 0).length;

  return (
    <WidgetTile
      title="Activity"
      size="md"
      headerRight={
        filter ? (
          <button
            onClick={() => setFilter("")}
            className="text-mini text-muted-foreground hover:text-foreground"
          >
            {filter} ×
          </button>
        ) : (
          <span className="text-mini tabular-nums text-muted-foreground">
            {active24h} services · 24h
          </span>
        )
      }
    >
      {err && <p className="text-petite text-red-500 dark:text-red-400">{err}</p>}
      {!err && withErrors.length > 0 && !filter && (
        <div className="mb-1 flex flex-wrap gap-1">
          {withErrors.map((s) => (
            <button
              key={s.service}
              onClick={() => setFilter(s.service)}
              className="border border-red-500/40 bg-red-500/10 px-1 py-px font-mono text-mini text-red-500 hover:bg-red-500/20 dark:text-red-400"
              title={`last error ${s.lastError ? fmtAge(s.lastError, now) + " ago" : ""}`}
            >
              {s.service} {s.errors24h}
            </button>
          ))}
        </div>
      )}
      {!err && rows.length === 0 && (
        <p className="text-petite text-muted-foreground">Loading activity...</p>
      )}
      {rows.length > 0 && (
        <div className="font-mono text-petite leading-snug">
          {rows.map((r) => (
            <div key={r.head.id} className="flex items-baseline gap-1.5 px-0.5 py-px">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 self-center rounded-full",
                  dotClass(r.head.severity)
                )}
              />
              <button
                onClick={() => setFilter(filter === r.head.service ? "" : r.head.service)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {r.head.service}
              </button>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  r.head.severity === "error" ? "text-red-500 dark:text-red-400" : "text-foreground/85"
                )}
                title={r.head.summary}
              >
                {cleanSummary(r.head)}
              </span>
              {r.count > 1 && (
                <span className="shrink-0 tabular-nums text-mini text-muted-foreground/60">
                  ×{r.count}
                </span>
              )}
              <span className="w-8 shrink-0 text-right text-mini tabular-nums text-muted-foreground/50">
                {fmtAge(r.head.ts, now)}
              </span>
            </div>
          ))}
        </div>
      )}
    </WidgetTile>
  );
}
