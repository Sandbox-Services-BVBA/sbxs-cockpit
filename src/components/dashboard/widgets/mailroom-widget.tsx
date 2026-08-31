"use client";

import Link from "next/link";
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
        <p className="text-petite text-muted-foreground">No data</p>
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
      headerRight={
        <div className="flex items-center gap-2 font-mono text-mini text-muted-foreground">
          <span>{mailroom.total} total</span>
          <Link href="/comms/mailroom" className="hover:text-foreground">
            open trail
          </Link>
        </div>
      }
    >
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black tabular-nums">{mailroom.today}</span>
          <span className="text-mini text-muted-foreground font-mono">TODAY</span>
          <span className="text-petite text-muted-foreground ml-auto font-mono">{mailroom.week}/wk</span>
        </div>
        <div className="space-y-0.5">
          {priorities.map((p) => {
            const recent = mailroom.recent_by_priority[p.key] || 0;
            if (recent === 0 && p.key === "spam") return null;
            return (
              <div key={p.key} className="flex justify-between text-mini font-mono">
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
