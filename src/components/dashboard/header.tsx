"use client";

import { RefreshCw, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

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

  return (
    <header className="border-b-2 border-border bg-card">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-[#fe644d] flex items-center justify-center border-2 border-[#cc4433]">
            <span className="text-[10px] font-black text-white">S</span>
          </div>
          <div>
            <h1 className="text-xs font-black tracking-wide uppercase">SBXS Cockpit</h1>
            {lastUpdated && (
              <p className="text-[9px] text-muted-foreground font-mono">
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
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-6 w-6 flex items-center justify-center border-2 border-border bg-muted hover:bg-accent"
          >
            <Sun className="h-3 w-3 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-3 w-3 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </button>
        </div>
      </div>
    </header>
  );
}
