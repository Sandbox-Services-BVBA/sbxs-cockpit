"use client";

import { useEffect, useRef, useState } from "react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/types";

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

// Compact "3s / 4m / 2h ago" formatter.
function ago(iso: string, nowMs: number): string {
  const then = new Date(iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z").getTime();
  const secs = Math.max(0, Math.round((nowMs - then) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

// Trim the home prefix so paths read as project-relative.
function shortPath(p: string): string {
  return p.replace(/^\/home\/dev-server\//, "~/").replace(/^\/home\/[^/]+\//, "~/");
}

interface Row {
  key: number; // stable react key = id of the event that created the row
  path: string;
  action: string;
  project: string | null;
  changed_at: string;
  count: number;
  fresh: boolean; // animate on first mount only
}

// Append incoming events (newest-first) onto the existing list without
// reordering existing rows — repeated saves of the file at the top just bump
// its count in place, so the feed updates smoothly instead of flashing.
function merge(prev: Row[], incoming: FileChange[]): Row[] {
  const list = prev.map((r) => ({ ...r, fresh: false }));
  for (let i = incoming.length - 1; i >= 0; i--) {
    const ev = incoming[i];
    const top = list[0];
    if (top && top.path === ev.path) {
      list[0] = { ...top, action: ev.action, changed_at: ev.changed_at, count: top.count + 1 };
    } else {
      list.unshift({
        key: ev.id,
        path: ev.path,
        action: ev.action,
        project: ev.project,
        changed_at: ev.changed_at,
        count: 1,
        fresh: true,
      });
    }
  }
  return list.slice(0, 200);
}

export function FileActivityWidget() {
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const lastId = useRef(0);

  // Incremental real-time poll (~1s): only ever fetches rows newer than the cursor.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/files?since=${lastId.current}&limit=200`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setFailed(false);
        setActive(data.activeLastMinute ?? 0);
        if (typeof data.lastId === "number") lastId.current = Math.max(lastId.current, data.lastId);
        if (data.changes?.length) setRows((prev) => merge(prev, data.changes));
      } catch {
        if (alive) setFailed(true);
      }
      if (alive) timer = setTimeout(poll, 1000);
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // Tick the relative timestamps every second (text-only update, no reflow flash).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = active > 0;

  return (
    <WidgetTile
      title="File Activity"
      size="sm"
      className="sm:col-span-2 lg:col-span-3 xl:col-span-5"
      headerRight={
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
          {live ? `${active} live` : "idle"}
        </span>
      }
    >
      {failed && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Feed unavailable</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No file changes in the last 30 min</p>
      ) : (
        <div className="max-h-80 overflow-y-auto scroll-smooth">
          <table className="w-full table-fixed font-mono text-[10px] leading-snug">
            <colgroup>
              <col className="w-3" />
              <col className="w-28" />
              <col />
              <col className="w-8" />
              <col className="w-9" />
            </colgroup>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.key}
                  className={cn(r.fresh && "animate-in fade-in slide-in-from-top-1 duration-200")}
                >
                  <td className={cn("text-center font-bold align-top", ACTION_COLOR[r.action] ?? "text-zinc-400")}>
                    {ACTION_GLYPH[r.action] ?? "~"}
                  </td>
                  <td className="truncate pl-1.5 pr-2 text-muted-foreground" title={r.project ?? ""}>
                    {r.project ?? ""}
                  </td>
                  <td className="truncate text-foreground/90" title={r.path}>
                    {shortPath(r.path)}
                  </td>
                  <td className="text-right text-muted-foreground/60 tabular-nums">
                    {r.count > 1 ? `×${r.count}` : ""}
                  </td>
                  <td className="text-right text-muted-foreground tabular-nums">{ago(r.changed_at, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WidgetTile>
  );
}
