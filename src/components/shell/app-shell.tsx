"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Activity, ArrowLeft, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useHydrated } from "@/hooks/use-hydrated";
import { getDashboardHealth, getFeedState } from "@/lib/dashboard-health";
import { useResolvedView } from "@/lib/layout/client";
import { pageForPath } from "@/lib/views";
import { cn } from "@/lib/utils";
import { FileModal } from "@/components/dashboard/widgets/file-explorer-widget";
import { CurrentTime } from "./current-time";

const THEME_ORDER = ["system", "light", "dark"] as const;

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  // next-themes reads localStorage, which the server cannot see; showing the
  // system icon until hydration keeps the first paint honest.
  const hydrated = useHydrated();
  const current = (hydrated ? theme : null) ?? "system";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  const cycle = () =>
    setTheme(THEME_ORDER[(THEME_ORDER.indexOf(current as (typeof THEME_ORDER)[number]) + 1) % 3]);

  return (
    <button
      type="button"
      onClick={cycle}
      className="app-icon-button"
      aria-label={`Theme: ${current}. Cycle system, light, dark`}
      title={`Theme: ${current}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * The one shell: a header over whatever the route renders. There is no
 * navigation because there is nothing to navigate to; the canvas at `/` is
 * the app, the wall is reached by URL, and the two drill-down consoles get
 * a way back in the header instead of a rail.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const page = pageForPath(pathname);
  const { data, error, loading, refresh } = useDashboardData();
  const feed = getFeedState(data, error);
  const attentionCount = getDashboardHealth(data).attentionCount;

  // Safety: alerts-summary is required and the resolver never drops it, but
  // if that rule ever slips the header still says how many signals are
  // live. The wall has its own attention queue as chrome, so it never needs
  // the pill.
  const canvas = useResolvedView("canvas");
  const alertsOnCanvas = canvas.modules.some((entry) => entry.moduleId === "alerts-summary");
  const alertFallback = page.view.id === "canvas" && !alertsOnCanvas && attentionCount > 0;

  return (
    <div className="app-shell" data-domain={page.view.id}>
      <header className="app-header">
        {page.drillDown ? (
          <Link href="/" className="app-icon-button" aria-label="Back to the cockpit" title="Back to the cockpit">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/" className="app-header__mark" aria-label="SBXS Cockpit">
            S
          </Link>
        )}

        <div className="app-header__title">
          <p className="eyebrow app-header__eyebrow">
            {page.view.id === "wall" ? "Shared display" : page.drillDown ? "Cockpit" : "SBXS"}
          </p>
          <h1 className="serif app-title">{page.title}</h1>
        </div>

        <div className="app-header__status">
          {alertFallback && (
            <span
              className="app-alert-pill"
              role="status"
              aria-label={`${attentionCount} signals need attention`}
              title="Attention is not on the canvas but has active signals"
            >
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{attentionCount}</span>
            </span>
          )}
          {/* The canvas mounts its own controls (add a tile, save state)
              here through a portal, so they sit with the rest of the header
              without the shell knowing what they are. */}
          <div id="app-header-actions" className="app-header__actions" />
          <CurrentTime />
          <span
            className={`feed-badge feed-badge--${feed.status}`}
            title={feed.detail}
            aria-label={`Data status: ${feed.label}. ${feed.detail}`}
          >
            <i aria-hidden="true" />
            <span className="feed-badge__label">{feed.label}</span>
            {feed.age && <b>{feed.age}</b>}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="app-icon-button"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          </button>
          <ThemeButton />
        </div>
      </header>

      <main className="app-main">{children}</main>
      <FileModal />
    </div>
  );
}
