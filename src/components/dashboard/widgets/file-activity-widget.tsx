"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ACTION_COLOR: Record<string, string> = {
  create: "text-emerald-400",
  modify: "text-cyan-400",
  delete: "text-red-400",
  move: "text-amber-400",
};

const ACTION_GLYPH: Record<string, string> = {
  create: "+",
  modify: "~",
  delete: "-",
  move: "→",
};

// Compact "3s / 4m / 2h ago" formatter — date-fns rounds everything under a
// minute to "less than a minute", too coarse for a live feed.
function ago(iso: string): string {
  const then = new Date(iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z").getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

// Trim the home prefix so paths read as project-relative.
function shortPath(p: string): string {
  return p.replace(/^\/home\/dev-server\//, "~/").replace(/^\/home\/[^/]+\//, "~/");
}

interface Grouped {
  path: string;
  action: string;
  project: string | null;
  changed_at: string;
  count: number;
}

export function FileActivityWidget() {
  const { data, error } = useSWR<{ changes: FileChange[]; activeLastMinute: number }>(
    "/api/files?minutes=30&limit=300",
    fetcher,
    { refreshInterval: 2000, dedupingInterval: 1000, keepPreviousData: true }
  );

  const changes = data?.changes ?? [];

  // Collapse repeated events on the same file into one row (latest wins + count).
  const byPath = new Map<string, Grouped>();
  for (const c of changes) {
    const existing = byPath.get(c.path);
    if (existing) {
      existing.count += 1;
    } else {
      byPath.set(c.path, { path: c.path, action: c.action, project: c.project, changed_at: c.changed_at, count: 1 });
    }
  }
  const files = Array.from(byPath.values()).slice(0, 50);
  const live = (data?.activeLastMinute ?? 0) > 0;

  return (
    <WidgetTile
      title="File Activity"
      size="lg"
      headerRight={
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              live ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
            )}
          />
          {live ? `${data?.activeLastMinute} live` : "idle"}
        </span>
      }
    >
      {error ? (
        <p className="text-xs text-muted-foreground">Feed unavailable</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No file changes in the last 30 min</p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-0.5 font-mono">
          {files.map((f) => {
            const recent = ago(f.changed_at).endsWith("s");
            return (
              <div
                key={f.path}
                className={cn(
                  "flex items-center gap-2 text-[10px] leading-tight",
                  recent && "bg-cyan-500/5"
                )}
              >
                <span className={cn("w-2 shrink-0 text-center font-bold", ACTION_COLOR[f.action] ?? "text-zinc-400")}>
                  {ACTION_GLYPH[f.action] ?? "~"}
                </span>
                {f.project && (
                  <span className="shrink-0 px-1 bg-muted text-muted-foreground rounded-sm max-w-[80px] truncate">
                    {f.project}
                  </span>
                )}
                <span className="flex-1 truncate text-foreground/90" title={f.path}>
                  {shortPath(f.path)}
                </span>
                {f.count > 1 && (
                  <span className="shrink-0 text-muted-foreground/60">×{f.count}</span>
                )}
                <span className="shrink-0 w-7 text-right text-muted-foreground tabular-nums">
                  {ago(f.changed_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WidgetTile>
  );
}
