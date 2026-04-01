"use client";

import { cn } from "@/lib/utils";

type Status = "ok" | "warning" | "critical" | "unknown" | "up" | "down";

const statusColors: Record<Status, string> = {
  ok: "bg-emerald-500",
  up: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  down: "bg-red-500",
  unknown: "bg-zinc-500",
};

const statusLabels: Record<Status, string> = {
  ok: "Healthy",
  up: "Up",
  warning: "Warning",
  critical: "Critical",
  down: "Down",
  unknown: "Unknown",
};

export function StatusDot({ status, size = "sm" }: { status: Status; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = { sm: "h-2 w-2", md: "h-3 w-3", lg: "h-4 w-4" };
  return (
    <span className="relative flex items-center">
      <span className={cn("rounded-full", statusColors[status], sizeClasses[size])} />
      {status === "critical" && (
        <span className={cn("absolute rounded-full animate-ping opacity-75", statusColors[status], sizeClasses[size])} />
      )}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const bgColors: Record<Status, string> = {
    ok: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    up: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    critical: "bg-red-500/10 text-red-400 ring-red-500/20",
    down: "bg-red-500/10 text-red-400 ring-red-500/20",
    unknown: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        bgColors[status]
      )}
    >
      <StatusDot status={status} size="sm" />
      {statusLabels[status]}
    </span>
  );
}

export function MetricValue({
  value,
  unit,
  size = "md",
}: {
  value: string | number;
  unit?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "text-lg font-semibold",
    md: "text-2xl font-bold",
    lg: "text-4xl font-bold",
  };

  return (
    <div className="flex items-baseline gap-1">
      <span className={cn("tracking-tight", sizeClasses[size])}>{value}</span>
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}
