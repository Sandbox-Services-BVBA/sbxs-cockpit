"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Activity, Monitor, Moon, MoreHorizontal, RefreshCw, SlidersHorizontal, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useHydrated } from "@/hooks/use-hydrated";
import { getDashboardHealth, getFeedState } from "@/lib/dashboard-health";
import { useLayout, useResolvedLayout } from "@/lib/layout/client";
import type { ViewId } from "@/lib/layout/types";
import { VIEW_BY_ID, viewForPath, type ViewMeta } from "@/lib/views";
import { cn } from "@/lib/utils";
import { FileModal } from "@/components/dashboard/widgets/file-explorer-widget";
import {
  EDITABLE_VIEWS,
  EditorBar,
  EditorUnavailable,
  PasswordPrompt,
  SectionsEditor,
} from "@/components/layout-editor";
import { CurrentTime } from "./current-time";

const THEME_ORDER = ["system", "light", "dark"] as const;

/**
 * Navigation as the saved profile wants it. Hidden domains are gone from the
 * lists, but their routes still work: the shell is the only thing that
 * reads this, the pages do not. The one exception is safety: when Attention
 * is hidden and the feed has an active exception, `alertFallback` puts an
 * entry back so customization can never silence a signal.
 */
function useNavigation(attentionCount: number) {
  const layout = useResolvedLayout();
  const visible = new Set(layout.domains.map((domain) => domain.viewId));
  const primary = layout.domains.filter((domain) => domain.viewId !== "wall").map((d) => VIEW_BY_ID[d.viewId]);
  const wall = visible.has("wall") ? VIEW_BY_ID.wall : null;
  const pinned = layout.mobilePins.map((id) => VIEW_BY_ID[id]);
  const rest = layout.domains
    .filter((domain) => !layout.mobilePins.includes(domain.viewId))
    .map((d) => VIEW_BY_ID[d.viewId]);
  const alertFallback = !visible.has("alerts") && attentionCount > 0;
  return { primary, wall, pinned, rest, alertFallback };
}

function RailLink({ view, active, badge }: { view: ViewMeta; active: boolean; badge?: number }) {
  const Icon = view.icon;
  return (
    <Link
      href={view.href}
      data-domain={view.id}
      aria-current={active ? "page" : undefined}
      className={cn("app-rail__link", active && "is-active", badge && "app-rail__link--alert")}
    >
      <Icon className="app-rail__icon" aria-hidden="true" />
      <span>{view.label}</span>
      {badge ? <b className="app-nav__badge">{badge}</b> : null}
    </Link>
  );
}

function Rail({
  current,
  nav,
  attentionCount,
}: {
  current: ViewMeta;
  nav: ReturnType<typeof useNavigation>;
  attentionCount: number;
}) {
  return (
    <aside className="app-rail">
      <Link href="/" className="app-rail__brand">
        <span className="app-rail__mark">S</span>
        <span className="app-rail__name">
          <strong className="serif">SBXS</strong>
          <span className="eyebrow">Control room</span>
        </span>
      </Link>

      <p className="eyebrow app-rail__section">Domains</p>
      <nav aria-label="Cockpit domains" className="app-rail__nav">
        {nav.alertFallback && (
          <RailLink view={VIEW_BY_ID.alerts} active={current.id === "alerts"} badge={attentionCount} />
        )}
        {nav.primary.map((view) => (
          <RailLink key={view.id} view={view} active={view.id === current.id} />
        ))}
      </nav>

      {nav.wall && (
        <>
          <div className="app-rail__rule" />
          <nav aria-label="Shared display" className="app-rail__nav">
            <RailLink view={nav.wall} active={current.id === "wall"} />
          </nav>
        </>
      )}

      <p className="app-rail__foot eyebrow">Cockpit 2.0</p>
    </aside>
  );
}

function BottomBar({
  current,
  nav,
  attentionCount,
}: {
  current: ViewMeta;
  nav: ReturnType<typeof useNavigation>;
  attentionCount: number;
}) {
  const pathname = usePathname();
  // The sheet is remembered per route rather than as a bare boolean, so
  // navigating away closes it without an effect that fires on every render.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (next: boolean) => setOpenFor(next ? pathname : null);

  const rest = nav.alertFallback ? [VIEW_BY_ID.alerts, ...nav.rest] : nav.rest;
  const restActive = rest.some((view) => view.id === current.id);
  const pinnedIds = new Set<ViewId>(nav.pinned.map((view) => view.id));
  // A hidden domain reached by URL is "somewhere behind More" without being
  // listed there; the button still names it so the bar stays truthful.
  const elsewhere = !pinnedIds.has(current.id);

  return (
    <>
      {open && (
        <button
          type="button"
          className="app-more__scrim"
          aria-label="Close the domain menu"
          onClick={() => setOpen(false)}
        />
      )}

      <nav aria-label="Cockpit domains" className="app-bottom">
        {open && (
          <div className="app-more" role="menu">
            {rest.length === 0 && <p className="app-more__empty">Every domain is pinned to the bar.</p>}
            {rest.map((view) => {
              const Icon = view.icon;
              const alert = nav.alertFallback && view.id === "alerts";
              return (
                <Link
                  key={view.id}
                  href={view.href}
                  role="menuitem"
                  data-domain={view.id}
                  aria-current={view.id === current.id ? "page" : undefined}
                  className={cn("app-more__link", view.id === current.id && "is-active", alert && "app-more__link--alert")}
                >
                  <Icon className="app-bottom__icon" aria-hidden="true" />
                  {view.label}
                  {alert && <b className="app-nav__badge">{attentionCount}</b>}
                </Link>
              );
            })}
          </div>
        )}

        <div className="app-bottom__row">
          {nav.pinned.map((view) => {
            const Icon = view.icon;
            const active = view.id === current.id;
            return (
              <Link
                key={view.id}
                href={view.href}
                data-domain={view.id}
                aria-current={active ? "page" : undefined}
                className={cn("app-bottom__link", active && "is-active")}
              >
                <Icon className="app-bottom__icon" aria-hidden="true" />
                <span>{view.short}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-haspopup="menu"
            data-domain={elsewhere ? current.id : undefined}
            className={cn("app-bottom__link", (restActive || elsewhere) && "is-active", nav.alertFallback && "app-bottom__link--alert")}
          >
            <MoreHorizontal className="app-bottom__icon" aria-hidden="true" />
            <span>{elsewhere ? current.short : "More"}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = viewForPath(pathname);
  const { data, error, loading, refresh } = useDashboardData();
  const feed = getFeedState(data, error);
  const attentionCount = getDashboardHealth(data).attentionCount;
  const nav = useNavigation(attentionCount);
  const { editing, editorTab, startEditing, authPrompt } = useLayout();

  // The wall is an unattended shared display: no editing there. A drill-down
  // route (logs, mailroom) and the views that still draw their own panes get
  // the Sections tab and an explanation instead of a module list.
  const customizable = current.id !== "wall";
  const editsInPlace = EDITABLE_VIEWS.has(current.id) && pathname === current.href;

  let main: ReactNode = children;
  if (editing && editorTab === "sections") {
    main = (
      <div className="cockpit-view">
        <SectionsEditor currentView={current.id} />
      </div>
    );
  } else if (editing && !editsInPlace) {
    main = <EditorUnavailable view={current} drillDown={pathname !== current.href} />;
  }

  return (
    <>
      <div className="app-shell" data-domain={current.id} inert={authPrompt || undefined}>
        <Rail current={current} nav={nav} attentionCount={attentionCount} />

        <div className="app-column">
          <header className={cn("app-header", editing && "app-header--editing")}>
            <Link href="/" className="app-header__mark" aria-label="SBXS Cockpit home">
              S
            </Link>

            <div className="app-header__title">
              <p className="eyebrow app-header__eyebrow">
                {editing ? "Customize" : current.id === "wall" ? "Shared display" : "Domain"}
              </p>
              <h1 className="serif app-title">{current.label}</h1>
            </div>

            <div className="app-header__status">
              {nav.alertFallback && (
                <Link
                  href="/attention"
                  className="app-alert-pill"
                  aria-label={`${attentionCount} signals need attention. Open Attention`}
                  title="Attention is hidden from navigation but has active signals"
                >
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{attentionCount}</span>
                </Link>
              )}
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
              {customizable && !editing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="app-icon-button"
                  aria-label="Customize layout"
                  title="Customize"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {editing && <EditorBar viewId={current.id} />}
          </header>

          <main className="app-main">{main}</main>
        </div>

        <BottomBar current={current} nav={nav} attentionCount={attentionCount} />
        <FileModal />
      </div>
      <PasswordPrompt />
    </>
  );
}
