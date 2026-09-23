"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useHydrated } from "@/hooks/use-hydrated";
import { pageForPath } from "@/lib/views";
import { cn } from "@/lib/utils";
import { FileModal } from "@/components/dashboard/widgets/file-explorer-widget";
import { LogoutButton } from "@/components/auth/logout-button";

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
 * The one shell. The canvas is the app, so it gets the full viewport instead
 * of paying for a permanent header. The app actions float in the top-right;
 * drill-down consoles add a compact way back beside them.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const page = pageForPath(pathname);
  const { loading, refresh } = useDashboardData();

  return (
    <div className="app-shell" data-domain={page.view.id}>
      <div className="app-floating-controls" role="toolbar" aria-label="Application controls">
        {page.drillDown ? (
          <Link href="/" className="app-icon-button" aria-label="Back to the cockpit" title="Back to the cockpit">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="app-icon-button"
          aria-label="Refresh dashboard"
          title="Refresh dashboard"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
        </button>
        <ThemeButton />
        <LogoutButton />
      </div>

      <main className="app-main">{children}</main>
      <FileModal />
    </div>
  );
}
