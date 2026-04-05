"use client";

import { WidgetTile } from "../widget-tile";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

export function ProjectsWidget({ projects }: { projects: Project[] }) {
  // Show most recently committed projects
  const sorted = [...projects]
    .filter((p) => p.last_commit_at)
    .sort((a, b) => new Date(b.last_commit_at!).getTime() - new Date(a.last_commit_at!).getTime())
    .slice(0, 8);

  if (sorted.length === 0) {
    return (
      <WidgetTile title="Recent Projects" size="md">
        <p className="text-xs text-muted-foreground">Waiting for data...</p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile
      title="Recent Projects"
      size="md"
      headerRight={<span className="text-[10px] text-muted-foreground">{projects.length} total</span>}
    >
      <div className="space-y-1.5">
        {sorted.map((p) => {
          const isStale = Date.now() - new Date(p.last_commit_at!).getTime() > 7 * 86400000;
          return (
            <div key={p.name} className="flex items-center gap-2">
              {p.ddev_running && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
              {!p.ddev_running && <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 shrink-0" />}
              <span className="text-xs truncate flex-1">{p.name}</span>
              <span className={cn("text-[10px] text-muted-foreground whitespace-nowrap", isStale && "text-amber-400")}>
                {formatDistanceToNow(new Date(p.last_commit_at!), { addSuffix: true })}
              </span>
            </div>
          );
        })}
      </div>
    </WidgetTile>
  );
}
