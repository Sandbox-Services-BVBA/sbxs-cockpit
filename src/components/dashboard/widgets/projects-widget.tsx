"use client";

import { WidgetTile } from "../widget-tile";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

export function ProjectsWidget({ projects }: { projects: Project[] }) {
  // Sort by last tmux activity (most recently worked on first)
  const sorted = [...projects]
    .filter((p) => p.last_activity_at || p.session_active)
    .sort((a, b) => {
      // Active sessions first
      if (a.session_active && !b.session_active) return -1;
      if (!a.session_active && b.session_active) return 1;
      // Then by last activity
      const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
      const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 10);

  if (sorted.length === 0) {
    return (
      <WidgetTile title="Recent Projects" size="md">
        <p className="text-xs text-muted-foreground">No active sessions</p>
      </WidgetTile>
    );
  }

  const activeCount = projects.filter((p) => p.session_active).length;

  return (
    <WidgetTile
      title="Recent Projects"
      size="md"
      headerRight={<span className="text-[10px] text-muted-foreground">{activeCount} active</span>}
    >
      <div className="space-y-1.5">
        {sorted.map((p) => {
          const lastActivity = p.last_activity_at
            ? formatDistanceToNow(new Date(p.last_activity_at), { addSuffix: true })
            : null;

          return (
            <div key={p.name} className="flex items-center gap-2">
              <span className={cn(
                "h-1.5 w-1.5  shrink-0",
                p.session_active ? "bg-emerald-500" : "bg-zinc-600"
              )} />
              <span className="text-xs truncate flex-1">{p.name}</span>
              {lastActivity && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {lastActivity}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </WidgetTile>
  );
}
