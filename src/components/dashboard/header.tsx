"use client";

import { RefreshCw, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { CockpitTone } from "@/lib/dashboard-health";

const THEME_ORDER = ["system", "light", "dark"] as const;

export function DashboardHeader({
  title,
  description,
  generatedAt,
  sourceUpdatedAt,
  tone,
  onRefresh,
  loading,
}: {
  title: string;
  description: string;
  generatedAt: string | null;
  sourceUpdatedAt: string | null;
  tone: CockpitTone;
  onRefresh: () => void;
  loading: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const current = theme ?? "system";
  const cycleTheme = () => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(current as (typeof THEME_ORDER)[number]) + 1) % 3]);
  const ThemeIcon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  const sourceLabel = sourceUpdatedAt
    ? new Date(sourceUpdatedAt.includes("T") ? sourceUpdatedAt : `${sourceUpdatedAt.replace(" ", "T")}Z`).toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "No source signal";

  const toneClasses: Record<CockpitTone, string> = {
    healthy: "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-600/25 bg-amber-600/10 text-amber-700 dark:text-amber-300",
    critical: "border-red-600/25 bg-red-600/10 text-red-700 dark:text-red-300",
    unknown: "border-border bg-muted text-muted-foreground",
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/88 backdrop-blur-xl">
      <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 py-3 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f15f48] text-sm font-black text-white lg:hidden">S</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-black tracking-[-0.04em]">{title}</h1>
              <span className={cn("hidden rounded-full border px-2 py-1 font-mono text-mini font-bold uppercase tracking-[0.12em] sm:inline-flex", toneClasses[tone])}>
                {tone === "healthy" ? "Nominal" : tone === "unknown" ? "Connecting" : "Attention"}
              </span>
            </div>
            <p className="mt-0.5 hidden truncate text-petite text-muted-foreground sm:block">{description}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden text-right xl:block">
            <p className="font-mono text-mini font-bold uppercase tracking-[0.13em] text-muted-foreground">Source signal</p>
            <p className="mt-0.5 text-petite font-semibold" title={generatedAt ? `Page refreshed ${new Date(generatedAt).toLocaleString()}` : undefined}>
              {sourceLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30 hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label={`Theme: ${current}. Change theme`}
            title={`Theme: ${current} (click to cycle system / light / dark)`}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30 hover:bg-accent"
          >
            <ThemeIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
