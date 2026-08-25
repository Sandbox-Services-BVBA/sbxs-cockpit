"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Monitor, Moon, MoreHorizontal, RefreshCw, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useHydrated } from "@/hooks/use-hydrated";
import { getFeedState } from "@/lib/dashboard-health";
import { BOTTOM_BAR_IDS, VIEWS, VIEW_BY_ID, viewForPath, type ViewMeta } from "@/lib/views";
import { cn } from "@/lib/utils";
import { FileModal } from "@/components/dashboard/widgets/file-explorer-widget";
import { CurrentTime } from "./current-time";

const THEME_ORDER = ["system", "light", "dark"] as const;

function RailLink({ view, active }: { view: ViewMeta; active: boolean }) {
  const Icon = view.icon;
  return (
    <Link
      href={view.href}
      data-domain={view.id}
      aria-current={active ? "page" : undefined}
      className={cn("app-rail__link", active && "is-active")}
    >
      <Icon className="app-rail__icon" aria-hidden="true" />
      <span>{view.label}</span>
    </Link>
  );
}

function Rail({ current }: { current: ViewMeta }) {
  const primary = VIEWS.filter((view) => view.id !== "wall");

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
        {primary.map((view) => (
          <RailLink key={view.id} view={view} active={view.id === current.id} />
        ))}
      </nav>

      <div className="app-rail__rule" />
      <nav aria-label="Shared display" className="app-rail__nav">
        <RailLink view={VIEW_BY_ID.wall} active={current.id === "wall"} />
      </nav>

      <p className="app-rail__foot eyebrow">Cockpit 2.0</p>
    </aside>
  );
}

function BottomBar({ current }: { current: ViewMeta }) {
  const pathname = usePathname();
  // The sheet is remembered per route rather than as a bare boolean, so
  // navigating away closes it without an effect that fires on every render.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (next: boolean) => setOpenFor(next ? pathname : null);

  const pinned = BOTTOM_BAR_IDS.map((id) => VIEW_BY_ID[id]);
  const rest = VIEWS.filter((view) => !BOTTOM_BAR_IDS.includes(view.id));
  const restActive = rest.some((view) => view.id === current.id);

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
            {rest.map((view) => {
              const Icon = view.icon;
              return (
                <Link
                  key={view.id}
                  href={view.href}
                  role="menuitem"
                  data-domain={view.id}
                  aria-current={view.id === current.id ? "page" : undefined}
                  className={cn("app-more__link", view.id === current.id && "is-active")}
                >
                  <Icon className="app-bottom__icon" aria-hidden="true" />
                  {view.label}
                </Link>
              );
            })}
          </div>
        )}

        <div className="app-bottom__row">
          {pinned.map((view) => {
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
            data-domain={restActive ? current.id : undefined}
            className={cn("app-bottom__link", restActive && "is-active")}
          >
            <MoreHorizontal className="app-bottom__icon" aria-hidden="true" />
            <span>{restActive ? current.short : "More"}</span>
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

  return (
    <div className="app-shell" data-domain={current.id}>
      <Rail current={current} />

      <div className="app-column">
        <header className="app-header">
          <Link href="/" className="app-header__mark" aria-label="SBXS Cockpit home">
            S
          </Link>

          <div className="app-header__title">
            <p className="eyebrow app-header__eyebrow">{current.id === "wall" ? "Shared display" : "Domain"}</p>
            <h1 className="serif app-title">{current.label}</h1>
          </div>

          <div className="app-header__status">
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
      </div>

      <BottomBar current={current} />
      <FileModal />
    </div>
  );
}
