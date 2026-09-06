"use client";

import Link from "next/link";
import { Monitor } from "lucide-react";
import { TimeframeBar } from "@/components/energy/timeframe-bar";
import { useHomeConsole } from "./home-console-provider";

/**
 * The global timeframe, sticky under the shell header. It drives every Home
 * tile on the canvas: live shows rates and controls, a period shows totals
 * and swaps gas and water in. Sits directly under the header whatever height
 * the notch makes it, and bleeds to the window edge through the shell's own
 * gutter. The Keuken link opens the always-on kitchen display.
 */
export function TimeframeStrip() {
  const { range, changeMode, step } = useHomeConsole();

  return (
    <div className="bleed-x sticky top-header-total z-20 border-b border-border/70 bg-background/90 py-2.5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <TimeframeBar range={range} onMode={changeMode} onStep={step} />
        </div>
        <Link
          href="/kitchen"
          title="Volledig scherm voor het keukendisplay"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card/70 px-2.5 py-1 text-mini font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Keuken</span>
        </Link>
      </div>
    </div>
  );
}
