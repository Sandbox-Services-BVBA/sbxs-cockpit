"use client";

import Link from "next/link";
import {
  BarChart3,
  BatteryCharging,
  Droplet,
  Flame,
  Lightbulb,
  Monitor,
  Snowflake,
  Thermometer,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { TimeframeBar } from "@/components/energy/timeframe-bar";
import { useLayout, useResolvedView } from "@/lib/layout/client";
import { GRID_CLASS } from "@/lib/layout/grid";
import { homeAnchorId, homeAnchorsFor, homeModeFor, homeModulesFor } from "@/lib/layout/home-modules";
import { ViewEditor } from "@/components/layout-editor";
import { HomeConsoleProvider, useHomeConsole } from "./home/home-console-provider";
import { ModuleFrame } from "./views/module-frame";
import { homeModuleNode } from "./views/home-renderers";

// Nav icons stay here, next to the markup, so the layout library holds only
// serializable metadata.
const NAV_ICONS: Record<string, LucideIcon> = {
  "home.house": Zap,
  "home.energy": BarChart3,
  "home.batteries": BatteryCharging,
  "home.gas": Flame,
  "home.water": Droplet,
  "home.climate": Thermometer,
  "home.ventilation": Wind,
  "home.airco": Snowflake,
  "home-control": Lightbulb,
};

// The provider owns the timeframe and the single live feed; everything under
// it, the sticky bar included, reads that one context. While Customize is
// active the console gives way to the editor list entirely: the provider is
// not mounted, so the 3 second live poll stops with it, and there is no
// desktop preview because the sections only make sense with that feed.
export function HouseConsole() {
  const { editing, ready } = useLayout();
  const resolved = useResolvedView("house");

  if (editing) {
    return (
      <div className="cockpit-view">
        <ViewEditor viewId="house" resolved={resolved} />
      </div>
    );
  }

  return (
    <HomeConsoleProvider>
      <HomeConsoleBody ready={ready} />
    </HomeConsoleProvider>
  );
}

function HomeConsoleBody({ ready }: { ready: boolean }) {
  const { range, isLive, live, changeMode, step } = useHomeConsole();
  const resolved = useResolvedView("house");

  // Live and period answer different questions, so a module that does not
  // apply to the current mode is not placed at all, and its anchor goes with
  // it. Hidden modules are already absent from `resolved.modules`, so they
  // never mount and a self-fetching one stops polling.
  // Nothing is placed until the profile is known, so a hidden self-fetching
  // module (raw metrics) never mounts on the defaults for a moment.
  const mode = homeModeFor(isLive);
  const modules = ready ? homeModulesFor(mode, resolved.modules) : [];
  const nav = homeAnchorsFor(mode, modules);

  return (
    <div className="space-y-3">
      {/* Anchors + the global timeframe that drives every section below. */}
      {/* Sits directly under the shell header, whatever height the notch makes
          it, and bleeds to the window edge through the shell's own gutter. */}
      <div className="bleed-x sticky top-header-total z-20 border-b border-border/70 bg-background/90 py-2.5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Home sections" className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-2">
            {nav.map((n) => {
              const Icon = NAV_ICONS[n.moduleId];
              return (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card/70 px-2.5 py-1 text-mini font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span className="hidden sm:inline">{n.label}</span>
                </a>
              );
            })}
          </nav>
          <Link
            href="/kitchen"
            title="Volledig scherm voor het keukendisplay"
            className="mb-2 flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card/70 px-2.5 py-1 text-mini font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Keuken</span>
          </Link>
        </div>
        <TimeframeBar range={range} onMode={changeMode} onStep={step} />
      </div>

      {live?.error ? (
        <div className="rounded-xl border border-red-600/35 bg-red-600/[0.08] px-4 py-3 text-petite text-red-800 dark:text-red-200">
          Energy monitor: {live.error}
        </div>
      ) : !live ? (
        <div className="cockpit-panel px-4 py-8 text-center text-petite text-muted-foreground">
          Verbinden met energy-monitor...
        </div>
      ) : (
        <div className={GRID_CLASS}>
          {modules.map((entry) => {
            const node = homeModuleNode(entry.moduleId, { density: entry.density });
            if (node === null) return null;
            // The anchor target sits inside the frame; scroll-mt clears the
            // sticky bar just as it did on the old section wrappers.
            const anchor = homeAnchorId(mode, entry.moduleId);
            return (
              <ModuleFrame key={entry.moduleId} resolved={entry}>
                <div id={anchor} className="scroll-mt-40">
                  {node}
                </div>
              </ModuleFrame>
            );
          })}
        </div>
      )}
    </div>
  );
}
