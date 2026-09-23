"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useHomeConsole } from "@/components/dashboard/home/home-console-provider";
import { homeTimeframeConfig } from "@/lib/layout/home-modules";

// Shared building blocks for the Home console. Same panel language as the rest
// of the cockpit (see .cockpit-panel), but laid out roomy and HomeWizard-like
// rather than dense like the compact widget tiles.

export function Section({
  id,
  title,
  icon: Icon,
  right,
  children,
  className,
}: {
  id?: string;
  title: string;
  icon?: LucideIcon;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const homeConsole = useHomeConsole();
  const timeframe = homeTimeframeConfig(homeConsole.moduleId);

  return (
    // The same contract WidgetTile has: fill the height the tile was
    // dragged to, keep the header put, and scroll the body. Scrolling the
    // whole card instead would drag its rounded corners under the clip.
    <section
      id={id}
      className={cn("cockpit-panel home-section @container flex h-full min-h-0 flex-col overflow-hidden scroll-mt-28", className)}
    >
      <header
        data-canvas-drag-handle
        className="home-section__header"
      >
        <div className="home-section__identity">
          {Icon && (
            <span className="home-section__icon" aria-hidden="true">
              <Icon />
            </span>
          )}
          <div>
            <p className="eyebrow">Ons huis</p>
            <h2 className="serif">{title}</h2>
          </div>
        </div>
        {(timeframe || right) && (
          <div className="home-section__meta">
            {timeframe && <span className="home-section__period">{homeConsole.range.label}</span>}
            {right}
          </div>
        )}
      </header>
      <div className="home-section__body">{children}</div>
    </section>
  );
}

// A big metric tile — the HomeWizard "current power" card feel.
export function Metric({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  color,
  hero,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  color?: string;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("home-metric flex flex-col justify-between rounded-xl border border-border/80 bg-background/40 px-3 py-3", className)}
      style={hero && color ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      <div className="home-metric__label">
        {Icon && <Icon className="h-4 w-4" style={{ color }} />}
        {label}
      </div>
      <div className={cn("home-metric__value mt-2 tabular-nums leading-none", hero ? "text-4xl" : "text-3xl")} style={{ color }}>
        {value}
        {unit && <span className="ml-1 text-base font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-tiny text-muted-foreground">{sub}</div>}
    </div>
  );
}

// Plain-language verdict banner.
export function Verdict({ text, good }: { text: string; good: boolean }) {
  const color = good ? "#22c55e" : "#ef4444";
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-bold sm:text-base"
      style={{ borderColor: color, color: good ? "#16a34a" : "#ef4444" }}
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      {text}
    </div>
  );
}

// Live heartbeat dot + label used in section headers.
export function LivePulse({ label, intervalMs, tick }: { label?: string; intervalMs: number; tick: number }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-tiny text-muted-foreground">
      <span
        key={tick}
        className="inline-block h-2 w-2"
        style={{ background: "#22c55e", animation: `energy-heartbeat ${intervalMs}ms ease-out forwards` }}
      />
      {label}
    </span>
  );
}

// Small segmented toggle (live/dag, ranges, etc.).
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex overflow-hidden rounded-lg", className)}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "border px-2.5 py-1 text-tiny font-bold uppercase tracking-wide transition-colors",
            i > 0 && "border-l-0",
            value === o.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
