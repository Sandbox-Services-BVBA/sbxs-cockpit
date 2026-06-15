"use client";

import { RefreshCw, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const THEME_ORDER = ["system", "light", "dark"] as const;

export function DashboardHeader({
  lastUpdated,
  onRefresh,
  loading,
}: {
  lastUpdated: string | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? theme ?? "system" : "system";
  const cycleTheme = () => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(current as (typeof THEME_ORDER)[number]) + 1) % 3]);
  const ThemeIcon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <header className="border-b-2 border-border bg-card">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-[#fe644d] flex items-center justify-center border-2 border-[#cc4433]">
            <span className="text-tiny font-black text-white">S</span>
          </div>
          <div>
            <h1 className="text-xs font-black tracking-wide uppercase">SBXS Cockpit</h1>
            {lastUpdated && (
              <p className="text-mini text-muted-foreground font-mono">
                {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="h-6 w-6 flex items-center justify-center border-2 border-border bg-muted hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
          <button
            onClick={cycleTheme}
            title={`Theme: ${current} (click to cycle system / light / dark)`}
            className="h-6 w-6 flex items-center justify-center border-2 border-border bg-muted hover:bg-accent"
          >
            <ThemeIcon className="h-3 w-3" />
          </button>
        </div>
      </div>
    </header>
  );
}
