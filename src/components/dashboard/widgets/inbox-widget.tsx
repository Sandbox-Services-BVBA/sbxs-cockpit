"use client";

import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

interface Inbox {
  account: string;
  unread: number;
  threads: number;
}

export function InboxWidget({ inboxes }: { inboxes: Inbox[] | null }) {
  if (!inboxes || inboxes.length === 0) {
    return (
      <WidgetTile title="Inboxes" size="sm">
        <p className="text-[11px] text-muted-foreground">No data</p>
      </WidgetTile>
    );
  }

  const totalUnread = inboxes.reduce((sum, i) => sum + Math.max(0, i.unread), 0);

  return (
    <WidgetTile
      title="Inboxes"
      size="sm"
      headerRight={<span className="text-[9px] font-mono text-muted-foreground">{totalUnread} total</span>}
    >
      <div className="space-y-1">
        {inboxes.map((i) => (
          <div key={i.account} className="flex items-center gap-1.5">
            <span className={cn(
              "h-1.5 w-1.5 shrink-0",
              i.unread < 0 ? "bg-[#ff4444]" : i.unread === 0 ? "bg-[#33aa55]" : i.unread < 50 ? "bg-[#ccaa33]" : "bg-[#ff4444]"
            )} />
            <span className="text-[11px] truncate flex-1">{i.account}</span>
            <span className={cn(
              "text-[9px] font-mono tabular-nums",
              i.unread < 0 ? "text-[#ff4444]" : i.unread > 100 ? "text-[#ff4444]" : "text-muted-foreground"
            )}>
              {i.unread < 0 ? "ERR" : i.unread}
            </span>
          </div>
        ))}
      </div>
    </WidgetTile>
  );
}
