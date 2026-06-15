"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface TimeEntry {
  description: string;
  duration: number;
  status: string;
  start_time: string;
  project: string;
  client: string;
}

const statusColors: Record<string, string> = {
  unbilled: "bg-muted-foreground",
  billable: "bg-[#ccaa33]",
  billed: "bg-[#33aa55]",
};

export function TimeEntriesWidget({ entries }: { entries: TimeEntry[] | null }) {
  if (!entries || entries.length === 0) {
    return (
      <WidgetTile title="Recent Toggl" size="sm">
        <p className="text-petite text-muted-foreground">No data</p>
      </WidgetTile>
    );
  }

  return (
    <WidgetTile title="Recent Toggl" size="sm">
      <div className="space-y-1.5">
        {entries.map((e, i) => {
          const hrs = (e.duration / 3600).toFixed(1);
          const ago = e.start_time ? formatDistanceToNow(new Date(e.start_time), { addSuffix: true }) : "";

          return (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 shrink-0", statusColors[e.status] || "bg-muted-foreground")} />
                <span className="text-petite truncate flex-1">{e.description || "No description"}</span>
                <span className="text-mini font-mono font-bold whitespace-nowrap">{hrs}h</span>
              </div>
              <div className="flex items-center gap-1.5 pl-3 text-mini font-mono text-muted-foreground">
                <span className="truncate">{e.client || e.project}</span>
                <span className="ml-auto whitespace-nowrap">{ago}</span>
                <span className="border border-border px-1 text-micro uppercase">{e.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetTile>
  );
}
