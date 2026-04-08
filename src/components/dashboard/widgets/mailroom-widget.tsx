"use client";

import { WidgetTile } from "../widget-tile";

interface MailroomData {
  total: number;
  today: number;
  week: number;
  by_priority: Record<string, number>;
  recent_by_priority: Record<string, number>;
}

export function MailroomWidget({ mailroom }: { mailroom: MailroomData | null }) {
  if (!mailroom) {
    return (
      <WidgetTile title="Mailroom" size="sm">
        <p className="text-[11px] text-muted-foreground">No data</p>
      </WidgetTile>
    );
  }

  const priorities = [
    { key: "urgent", label: "URGENT", color: "text-[#ff4444]" },
    { key: "action", label: "ACTION", color: "text-[#ccaa33]" },
    { key: "info", label: "INFO", color: "text-muted-foreground" },
    { key: "skipped", label: "SKIP", color: "text-muted-foreground" },
    { key: "spam", label: "SPAM", color: "text-muted-foreground" },
  ];

  return (
    <WidgetTile
      title="Mailroom"
      size="sm"
      headerRight={<span className="text-[9px] font-mono text-muted-foreground">{mailroom.total} total</span>}
    >
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black tabular-nums">{mailroom.today}</span>
          <span className="text-[9px] text-muted-foreground font-mono">TODAY</span>
          <span className="text-[11px] text-muted-foreground ml-auto font-mono">{mailroom.week}/wk</span>
        </div>
        <div className="space-y-0.5">
          {priorities.map((p) => {
            const recent = mailroom.recent_by_priority[p.key] || 0;
            if (recent === 0 && p.key === "spam") return null;
            return (
              <div key={p.key} className="flex justify-between text-[9px] font-mono">
                <span className="text-muted-foreground">{p.label}</span>
                <span className={recent > 0 ? p.color : "text-muted-foreground"}>{recent}</span>
              </div>
            );
          })}
        </div>
      </div>
    </WidgetTile>
  );
}
