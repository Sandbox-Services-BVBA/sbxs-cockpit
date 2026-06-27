"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TF_OPTIONS, type Range, type TFMode } from "@/lib/energy-range";

// The global timeframe control: Live / Dag / Week / Maand / Jaar + period nav.
// Lives in the sticky page header and drives every chart on the page.
export function TimeframeBar({
  range,
  onMode,
  onStep,
}: {
  range: Range;
  onMode: (m: TFMode) => void;
  onStep: (delta: number) => void;
}) {
  const showNav = range.mode !== "live";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-between">
      <div className="flex">
        {TF_OPTIONS.map((o, i) => (
          <button
            key={o.value}
            onClick={() => onMode(o.value)}
            className={cn(
              "border-2 px-3 py-1 text-tiny font-bold uppercase tracking-wide transition-colors sm:px-4",
              i > 0 && "border-l-0",
              range.mode === o.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {showNav && (
          <button
            onClick={() => onStep(-1)}
            className="border-2 border-border p-1 text-muted-foreground hover:text-foreground"
            aria-label="Vorige periode"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="min-w-[120px] text-center text-petite font-bold capitalize tabular-nums text-foreground">
          {range.label}
        </span>
        {showNav && (
          <button
            onClick={() => onStep(1)}
            disabled={range.canNext}
            className="border-2 border-border p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Volgende periode"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
