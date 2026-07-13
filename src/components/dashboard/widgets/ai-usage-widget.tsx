"use client";

import { useEffect, useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { AiUsage, AiProviderUsage } from "@/types";

// Meter fill carries severity; the unfilled track is a lighter step of the
// same hue so state reads across the whole bar.
function toneFor(pct: number) {
  if (pct >= 85) return { fill: "bg-red-500", track: "bg-red-500/15" };
  if (pct >= 60) return { fill: "bg-amber-500", track: "bg-amber-500/15" };
  return { fill: "bg-emerald-500", track: "bg-emerald-500/15" };
}

function relTime(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const diffMin = Math.round((new Date(iso).getTime() - nowMs) / 60000);
  const abs = Math.abs(diffMin);
  const span = abs < 60 ? `${abs}m` : abs < 2880 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`;
  return diffMin >= 0 ? `in ${span}` : `${span} ago`;
}

function Meter({ label, pct, resetsAt, nowMs }: {
  label: string;
  pct: number | null;
  resetsAt: string | null;
  nowMs: number;
}) {
  // A window whose reset moment has passed since the snapshot is back at zero.
  const expired = resetsAt != null && new Date(resetsAt).getTime() < nowMs;
  const value = expired ? 0 : pct == null ? null : Math.max(0, Math.min(100, pct));
  const tone = toneFor(value ?? 0);

  return (
    <div className="flex items-center gap-2" title={resetsAt ? `resets ${relTime(resetsAt, nowMs)}` : undefined}>
      <span className="w-14 shrink-0 truncate font-mono text-mini text-muted-foreground">{label}</span>
      <div className={cn("h-1.5 min-w-0 flex-1 overflow-hidden rounded-full", tone.track)}>
        {value != null && value > 0 && (
          <div className={cn("h-full rounded-full", tone.fill)} style={{ width: `${Math.max(value, 3)}%` }} />
        )}
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-mini tabular-nums text-foreground">
        {value == null ? "—" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

function ProviderBlock({ name, usage, nowMs }: {
  name: string;
  usage: AiProviderUsage | null | undefined;
  nowMs: number;
}) {
  if (!usage) {
    return (
      <div>
        <p className="text-petite font-bold">{name}</p>
        <p className="mt-1 text-mini text-muted-foreground">No data yet</p>
      </div>
    );
  }

  if (!usage.ok) {
    return (
      <div>
        <p className="text-petite font-bold">{name}</p>
        <p className="mt-1 truncate text-mini text-red-400" title={usage.error ?? ""}>
          {usage.error || "collector failed"}
        </p>
      </div>
    );
  }

  const snapshotAgeMin = usage.captured_at
    ? (nowMs - new Date(usage.captured_at).getTime()) / 60000
    : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-petite font-bold">
          {name}
          {usage.plan && (
            <span className="ml-1.5 font-mono text-mini font-normal uppercase text-muted-foreground">{usage.plan}</span>
          )}
        </p>
        {snapshotAgeMin != null && snapshotAgeMin > 30 && (
          <span className="font-mono text-mini text-muted-foreground" title="Age of the last usage snapshot">
            {relTime(usage.captured_at, nowMs)}
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-1.5">
        <Meter label="5h" pct={usage.session_pct} resetsAt={usage.session_resets_at} nowMs={nowMs} />
        <Meter label="7d" pct={usage.weekly_pct} resetsAt={usage.weekly_resets_at} nowMs={nowMs} />
        {usage.weekly_model_pct != null && (
          <Meter
            label={`7d ${usage.weekly_model_name || "model"}`}
            pct={usage.weekly_model_pct}
            resetsAt={usage.weekly_resets_at}
            nowMs={nowMs}
          />
        )}
      </div>
    </div>
  );
}

export function AiUsageWidget({ aiUsage }: { aiUsage?: AiUsage | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!aiUsage) {
    return (
      <WidgetTile title="AI Usage" size="sm">
        <p className="text-xs text-muted-foreground">Waiting for agent...</p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile title="AI Usage" size="sm">
      <div className="space-y-4">
        <ProviderBlock name="Claude" usage={aiUsage.claude} nowMs={now} />
        <ProviderBlock name="Codex" usage={aiUsage.codex} nowMs={now} />
      </div>
    </WidgetTile>
  );
}
