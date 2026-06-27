"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Shared building blocks for the Energy page. Square-cornered, 2px borders —
// the cockpit house style — but laid out roomy and HomeWizard-like rather than
// dense like the legacy widget tiles.

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
  return (
    <section id={id} className={cn("scroll-mt-20 border-2 border-border bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b-2 border-border px-3 py-2 sm:px-4">
        <h2 className="flex items-center gap-2 text-tiny font-bold uppercase tracking-widest text-muted-foreground">
          {Icon && <Icon className="h-4 w-4" />}
          {title}
        </h2>
        {right && <div className="flex items-center gap-2 text-tiny text-muted-foreground">{right}</div>}
      </header>
      <div className="p-3 sm:p-4">{children}</div>
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
      className={cn("flex flex-col justify-between border-2 border-border px-3 py-3", className)}
      style={hero && color ? { boxShadow: `inset 0 0 0 2px ${color}` } : undefined}
    >
      <div className="flex items-center gap-1.5 text-tiny font-bold uppercase tracking-widest text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" style={{ color }} />}
        {label}
      </div>
      <div className={cn("mt-2 font-bold tabular-nums leading-none", hero ? "text-4xl" : "text-3xl")} style={{ color }}>
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
      className="flex items-center gap-2.5 border-2 px-3 py-2 text-sm font-bold sm:text-base"
      style={{ borderColor: color, color: good ? "#16a34a" : "#ef4444" }}
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: color }} />
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
    <div className={cn("flex", className)}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "border-2 px-2.5 py-1 text-tiny font-bold uppercase tracking-wide transition-colors",
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
