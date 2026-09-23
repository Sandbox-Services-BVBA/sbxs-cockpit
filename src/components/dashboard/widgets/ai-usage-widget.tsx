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

function resetCountdown(iso: string | null, nowMs: number): string | null {
  if (!iso) return null;
  const remaining = new Date(iso).getTime() - nowMs;
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) return "Reset due";
  if (remaining < 60000) return "Resets in <1m";
  const minutes = Math.ceil(remaining / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const span = days > 0
    ? `${days}d ${hours}h`
    : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  return `Resets in ${span}`;
}

function Meter({ label, pct, resetsAt, nowMs }: {
  label: string;
  pct: number | null;
  resetsAt: string | null;
  nowMs: number;
}) {
  // Keep the last measured usage until a fresh snapshot confirms the reset.
  const value = pct == null ? null : Math.max(0, Math.min(100, pct));
  const tone = toneFor(value ?? 0);
  const countdown = resetCountdown(resetsAt, nowMs);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
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
      {countdown && resetsAt && (
        <p className="text-right font-mono text-mini tabular-nums text-muted-foreground">
          <time dateTime={resetsAt} title={new Date(resetsAt).toLocaleString()}>{countdown}</time>
        </p>
      )}
    </div>
  );
}

function ProviderBlock({ name, usage, nowMs, showBankedResets = false }: {
  name: string;
  usage: AiProviderUsage | null | undefined;
  nowMs: number;
  showBankedResets?: boolean;
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
        <p className="truncate text-petite font-bold">
          {name}
          {usage.active && (
            <span className="ml-1.5 rounded bg-primary/15 px-1 py-0.5 font-mono text-[9px] font-normal uppercase text-primary">
              active
            </span>
          )}
        </p>
        {usage.email && <p className="truncate font-mono text-mini text-muted-foreground">{usage.email}</p>}
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
        <div className="min-w-0">
          <p className="truncate text-petite font-bold">
            {name}
            {usage.plan && (
              <span className="ml-1.5 font-mono text-mini font-normal uppercase text-muted-foreground">{usage.plan}</span>
            )}
            {usage.active && (
              <span className="ml-1.5 rounded bg-primary/15 px-1 py-0.5 font-mono text-[9px] font-normal uppercase text-primary">
                active
              </span>
            )}
          </p>
          {usage.email && <p className="truncate font-mono text-mini text-muted-foreground">{usage.email}</p>}
        </div>
        {snapshotAgeMin != null && snapshotAgeMin > 30 && (
          <span className="font-mono text-mini text-muted-foreground" title="Age of the last usage snapshot">
            {relTime(usage.captured_at, nowMs)}
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-1.5">
        <Meter label={usage.session_label || "5h"} pct={usage.session_pct} resetsAt={usage.session_resets_at} nowMs={nowMs} />
        {usage.weekly_pct != null && (
          <Meter label={usage.weekly_label || "7d"} pct={usage.weekly_pct} resetsAt={usage.weekly_resets_at} nowMs={nowMs} />
        )}
        {usage.weekly_model_pct != null && (
          <Meter
            label={`7d ${usage.weekly_model_name || "model"}`}
            pct={usage.weekly_model_pct}
            resetsAt={usage.weekly_resets_at}
            nowMs={nowMs}
          />
        )}
        {showBankedResets && (
          <div className="flex items-center justify-between gap-2 font-mono text-mini">
            <span className="text-muted-foreground">Banked resets</span>
            <span className="tabular-nums">{usage.banked_resets ?? "Unavailable"}</span>
          </div>
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

  const codexAccounts = aiUsage.codex_accounts?.length
    ? aiUsage.codex_accounts
    : aiUsage.codex
      ? [aiUsage.codex]
      : [];

  return (
    <WidgetTile title="AI Usage" size="sm">
      <div className="space-y-4">
        <ProviderBlock name="Claude" usage={aiUsage.claude} nowMs={now} />
        {codexAccounts.length ? codexAccounts.map((usage) => (
          <ProviderBlock
            key={usage.account || usage.email || "codex"}
            name="ChatGPT / Codex"
            usage={usage}
            nowMs={now}
            showBankedResets
          />
        )) : <ProviderBlock name="ChatGPT / Codex" usage={null} nowMs={now} />}
      </div>
    </WidgetTile>
  );
}
