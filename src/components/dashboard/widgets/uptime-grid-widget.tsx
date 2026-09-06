"use client";

import { useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { ModuleDensity } from "@/lib/layout/types";
import type { UptimeCheck } from "@/types";
import { cutByDensity, foldLabel } from "../infra/density";
import { DensityFold } from "../infra/density-fold";

/**
 * Uptime monitor.
 *
 * One line per site, worst first, scrolling inside whatever height the tile
 * has been dragged to. The old version stacked a 24-bar strip under every row
 * inside a three-column grid, which at a realistic tile size produced rows too
 * short to read and sparklines too thin to mean anything. Here the row is the
 * unit: a tone dot, the name, and a right-aligned mono readout, with the
 * history reduced to a compact inline strip that only appears once the tile is
 * wide enough to spare the 72px.
 *
 * Everything responds to the tile through container queries, never the
 * viewport, because the same widget can be six columns wide on the wall and
 * full width on Sites in the same window.
 */

export type UptimeSite = UptimeCheck & { failing_paths?: string[] };

/** Matches the SSL warning threshold the alert rules use. */
const SSL_WARN_DAYS = 14;
/** Rounds of history drawn in the inline strip. */
const SPARK_ROUNDS = 24;

function sslWarning(site: UptimeSite): boolean {
  return site.ssl_days_remaining !== null && site.ssl_days_remaining <= SSL_WARN_DAYS;
}

/** A site is healthy when it answers and its certificate is not about to lapse. */
function isHealthy(site: UptimeSite): boolean {
  return site.is_up && !sslWarning(site);
}

/** Down first, then certificates about to lapse, then the quiet ones. */
function rank(site: UptimeSite): number {
  if (!site.is_up) return 0;
  if (sslWarning(site)) return 1;
  return 2;
}

/** A stored URL is not guaranteed to parse; a bad row must not blank the tile. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface Round {
  checked_at: string;
  is_up: boolean;
  response_time_ms: number | null;
}

/**
 * One check round can cover several paths on the same site. The site counts as
 * up for that round only if every path answered, so a single broken path still
 * paints the strip red.
 */
function rounds(checks: UptimeCheck[]): Round[] {
  const byTime = new Map<string, Round>();
  for (const c of checks) {
    const existing = byTime.get(c.checked_at);
    if (!existing) {
      byTime.set(c.checked_at, { checked_at: c.checked_at, is_up: !!c.is_up, response_time_ms: c.response_time_ms });
    } else if (!c.is_up) {
      existing.is_up = false;
    }
  }
  return Array.from(byTime.values()).slice(0, SPARK_ROUNDS).reverse();
}

/**
 * Recent history as a fixed-width strip. Up rounds are a low, muted green
 * texture and down rounds a full-height rose tick, so an outage reads as a
 * spike rather than as a colour you have to look for. The box keeps its width
 * whether or not there is history, so the columns to its right stay aligned
 * across rows.
 */
function UptimeSpark({ history }: { history: UptimeCheck[] }) {
  const bars = rounds(history);
  const up = bars.filter((b) => b.is_up).length;
  const label = bars.length > 0
    ? `${Math.round((up / bars.length) * 100)}% up over the last ${bars.length} checks`
    : "No history yet";

  return (
    <div
      className="hidden h-4 w-[72px] shrink-0 items-end gap-px @xl:flex"
      title={label}
      aria-label={label}
      role="img"
    >
      {bars.map((b) => (
        <div
          key={b.checked_at}
          className={cn("min-w-px flex-1 rounded-[1px]", b.is_up ? "h-2 bg-green/45" : "h-4 bg-rose")}
          title={`${b.checked_at}: ${b.is_up ? "up" : "down"}${b.response_time_ms !== null ? ` (${b.response_time_ms}ms)` : ""}`}
        />
      ))}
    </div>
  );
}

function UptimeRow({ site, history }: { site: UptimeSite; history: UptimeCheck[] }) {
  const down = !site.is_up;
  const warn = sslWarning(site);
  const failing = site.failing_paths ?? [];

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 border-l-2 py-1.5 pl-3.5 pr-4",
        down ? "border-rose bg-rose/10" : "border-transparent"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          down ? "bg-rose motion-safe:animate-pulse" : warn ? "bg-amber" : "bg-green"
        )}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn("truncate text-petite font-bold", down && "text-rose")}>{site.site_name}</span>
          <span className="hidden truncate font-mono text-micro text-muted-foreground @md:inline">
            {hostnameOf(site.site_url)}
          </span>
        </div>
        {down && failing.length > 0 && (
          <p className="truncate font-mono text-micro text-rose/85">
            {failing.map((p) => (p === "/" ? "/ (root)" : p)).join("  ")}
          </p>
        )}
      </div>

      <UptimeSpark history={history} />

      {/* The state is a word, not only a colour, so the row survives greyscale. */}
      <span
        className={cn(
          "w-12 shrink-0 text-right font-mono text-mini tabular-nums",
          down ? "font-bold text-rose" : "text-muted-foreground"
        )}
      >
        {down ? "DOWN" : site.response_time_ms !== null ? `${site.response_time_ms}ms` : "--"}
      </span>

      {/* A certificate inside the warning window is never hidden, however
          narrow the tile; a comfortable one gives up its column first. */}
      {site.ssl_days_remaining !== null && (
        <span
          className={cn(
            "w-16 shrink-0 text-right font-mono text-mini tabular-nums",
            warn ? "font-bold text-amber" : "hidden text-muted-foreground @sm:inline-block"
          )}
        >
          SSL {site.ssl_days_remaining}d
        </span>
      )}
    </li>
  );
}

/** The header readout: what a glance has to land on before anything else. */
export function UptimeStatusPill({ uptime }: { uptime: UptimeSite[] }) {
  const down = uptime.filter((u) => !u.is_up).length;
  const warn = uptime.filter((u) => u.is_up && sslWarning(u)).length;

  if (down > 0) {
    return (
      <span className="shrink-0 rounded-full border border-rose/45 bg-rose/12 px-2 py-0.5 font-mono text-mini font-bold tabular-nums text-rose">
        {down} DOWN
      </span>
    );
  }
  if (warn > 0) {
    return (
      <span className="shrink-0 rounded-full border border-amber/45 bg-amber/12 px-2 py-0.5 font-mono text-mini font-bold tabular-nums text-amber">
        {warn} SSL SOON
      </span>
    );
  }
  return (
    <span className="shrink-0 font-mono text-mini tabular-nums text-green">
      {uptime.length}/{uptime.length} up
    </span>
  );
}

/**
 * The list itself, without a panel around it, so the widget and the standalone
 * section render the identical rows.
 */
export function UptimeBoard({
  uptime,
  uptimeHistory,
  density = "standard",
}: {
  uptime: UptimeSite[];
  uptimeHistory?: UptimeCheck[];
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  const sorted = [...uptime].sort((a, b) => rank(a) - rank(b));
  const cut = cutByDensity(sorted, density, isHealthy, expanded);

  const history = uptimeHistory ?? [];

  return (
    <>
      {cut.rows.length > 0 && (
        <ul className="divide-y divide-border/45 py-1">
          {cut.rows.map((u) => (
            <UptimeRow key={u.site_url} site={u} history={history.filter((h) => h.site_url === u.site_url)} />
          ))}
        </ul>
      )}
      {cut.fold && (
        <div className={cn("px-4 pb-1", cut.rows.length > 0 && "border-t border-border/45")}>
          <DensityFold
            label={foldLabel(cut, "site", "up")}
            total={cut.total}
            expanded={expanded}
            onToggle={() => setExpanded((open) => !open)}
          />
        </div>
      )}
    </>
  );
}

export function UptimeGridWidget({
  uptime,
  uptimeHistory,
  density = "standard",
}: {
  uptime: UptimeSite[];
  uptimeHistory?: UptimeCheck[];
  density?: ModuleDensity;
}) {
  if (uptime.length === 0) {
    return (
      <WidgetTile title="Uptime Monitor" size="lg">
        <p className="text-petite text-muted-foreground">No uptime data yet</p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile
      title="Uptime Monitor"
      size="lg"
      // Rows run edge to edge: the rose bar on a down row belongs against the
      // panel wall, not floating inside a gutter.
      bodyClassName="px-0 py-0"
      headerRight={<UptimeStatusPill uptime={uptime} />}
    >
      <UptimeBoard uptime={uptime} uptimeHistory={uptimeHistory} density={density} />
    </WidgetTile>
  );
}
