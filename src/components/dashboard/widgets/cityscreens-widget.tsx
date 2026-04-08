"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

interface Display {
  player_id: string;
  name: string;
  location: string;
  mode: string;
  last_seen: string;
  active: boolean;
}

export function CityScreensWidget({ displays }: { displays: Display[] | null }) {
  if (!displays || displays.length === 0) {
    return (
      <WidgetTile title="CityScreens" size="sm">
        <p className="text-[11px] text-muted-foreground">No data</p>
      </WidgetTile>
    );
  }

  const online = displays.filter((d) => d.mode === "online");
  const offline = displays.filter((d) => d.mode !== "online");

  return (
    <WidgetTile
      title="CityScreens"
      size="sm"
      headerRight={
        <span className={cn("text-[9px] font-mono", offline.length > 0 ? "text-[#ff4444]" : "text-[#33aa55]")}>
          {online.length}/{displays.length} online
        </span>
      }
    >
      <div className="space-y-1">
        {displays.map((d) => (
          <div key={d.player_id} className="flex items-center gap-1.5">
            <span className={cn(
              "h-1.5 w-1.5 shrink-0",
              d.mode === "online" ? "bg-[#33aa55]" : "bg-[#ff4444]"
            )} />
            <span className="text-[11px] truncate flex-1">{d.name || d.player_id}</span>
            <span className="text-[9px] font-mono text-muted-foreground uppercase">{d.mode}</span>
          </div>
        ))}
      </div>
    </WidgetTile>
  );
}
