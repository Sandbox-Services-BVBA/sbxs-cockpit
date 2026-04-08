"use client";

import { RefreshCw, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-2.5 py-2">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-[#fe644d] flex items-center justify-center">
            <span className="text-xs font-bold text-white">S</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">SBXS Cockpit</h1>
            {lastUpdated && (
              <p className="text-[10px] text-muted-foreground">
                {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            className="h-7 w-7"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-7 w-7"
          >
            <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </div>
      </div>
    </header>
  );
}
