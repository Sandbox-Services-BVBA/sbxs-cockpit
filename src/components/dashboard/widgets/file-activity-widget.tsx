"use client";

import { useEffect, useRef, useState } from "react";
import { WidgetTile } from "../widget-tile";
import type { LayoutMode } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";
import { openFile } from "@/lib/file-viewer-store";
import type { FileChange } from "@/types";

// Background churn that drowns out the files you're actually editing — session
// logs, mail polling, and service heartbeat/state writes (e.g. peppol-watcher's
// data/state.json). Service liveness lives in the Services widget instead.
const NOISE_PROJECTS = new Set([".claude", "mailroom"]);
const NOISE_PATH = /\/data\/|\/state\.json$|\.(db|db-wal|db-shm|sqlite|jsonl)$/;
const NOISE_STORAGE_KEY = "cockpit:fileActivityShowNoise";

function isNoise(r: { project: string | null; path: string }): boolean {
  return NOISE_PROJECTS.has(r.project ?? "") || NOISE_PATH.test(r.path);
}

// Atomic-write temp/duplicate artifacts: editors and tools write a sibling like
// "name.tmp.<pid>.<hash>" (or sed/backup/swap files) then rename — so every real
// save spawns a duplicate event for a file that never really existed.
const TEMP_PATH =
  /\.tmp\.\d+\.[0-9a-f]+$|\.\d+\.tmp$|(^|\/)sed[A-Za-z0-9]{6}$|\.goutputstream-|\.backup\.\d+$|(^|\/)4913$|\.(swp|swx|swo|bak|orig|old|part|crdownload)$|~$|(^|\/)#.*#$|(^|\/)\.#/i;
const TEMP_STORAGE_KEY = "cockpit:fileActivityShowTemp";

function isTemp(path: string): boolean {
  return TEMP_PATH.test(path);
}

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

function tsOf(iso: string): number {
  return new Date(iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z").getTime();
}

// Compact "3s / 4m / 2h ago" formatter.
function ago(iso: string, nowMs: number): string {
  const secs = Math.max(0, Math.round((nowMs - tsOf(iso)) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

// Trim the home prefix so paths read as project-relative.
function shortPath(p: string): string {
  return p.replace(/^\/home\/dev-server\//, "~/").replace(/^\/home\/[^/]+\//, "~/");
}

interface Row {
  path: string;
  action: string;
  project: string | null;
  changed_at: string;
  count: number;
  fresh: boolean; // animate on first appearance only
}

// One row per file: re-touching a file moves it to the front and bumps its
// count, instead of adding a duplicate row. Keeps the list short and readable.
function merge(prev: Row[], incoming: FileChange[]): Row[] {
  const map = new Map<string, Row>();
  // Seed oldest-first so Map insertion order runs oldest..newest.
  for (let i = prev.length - 1; i >= 0; i--) {
    map.set(prev[i].path, { ...prev[i], fresh: false });
  }
  for (let i = incoming.length - 1; i >= 0; i--) {
    const ev = incoming[i];
    const ex = map.get(ev.path);
    if (ex) {
      map.delete(ev.path);
      map.set(ev.path, { ...ex, action: ev.action, changed_at: ev.changed_at, count: ex.count + 1, fresh: false });
    } else {
      map.set(ev.path, {
        path: ev.path,
        action: ev.action,
        project: ev.project,
        changed_at: ev.changed_at,
        count: 1,
        fresh: true,
      });
    }
  }
  return Array.from(map.values()).reverse().slice(0, 2000); // newest-first
}

function Toggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "px-1.5 py-0.5 text-mini font-bold uppercase tracking-wide border transition-colors",
        on
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted text-muted-foreground border-border hover:border-muted-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function FileActivityWidget({ layout = "grid" }: { layout?: LayoutMode }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [showTemp, setShowTemp] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const lastId = useRef(0);

  // Restore filter toggles, then persist changes (skip the initial restore).
  useEffect(() => {
    try {
      setShowNoise(localStorage.getItem(NOISE_STORAGE_KEY) === "1");
      setShowTemp(localStorage.getItem(TEMP_STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setPrefsReady(true);
  }, []);
  useEffect(() => {
    if (!prefsReady) return;
    try {
      localStorage.setItem(NOISE_STORAGE_KEY, showNoise ? "1" : "0");
      localStorage.setItem(TEMP_STORAGE_KEY, showTemp ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showNoise, showTemp, prefsReady]);

  // Incremental real-time poll (~1s): only ever fetches rows newer than the cursor.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/files?since=${lastId.current}&minutes=180&limit=3500`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setFailed(false);
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

  // Tick the relative timestamps every second (text-only update).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const visible = rows.filter((r) => (showNoise || !isNoise(r)) && (showTemp || !isTemp(r.path)));
  const liveCount = visible.filter((r) => now - tsOf(r.changed_at) < 60000).length;
  const allFiltered = rows.length > 0 && visible.length === 0;

  return (
    <WidgetTile
      title="File Activity"
      size="lg"
      headerRight={
        <div className="flex items-center gap-2">
          <Toggle on={showTemp} onClick={() => setShowTemp((v) => !v)} label="temp"
            title="Show/hide temporary/duplicate write artifacts (name.tmp.*, backups, swap files)" />
          <Toggle on={showNoise} onClick={() => setShowNoise((v) => !v)} label="noise"
            title="Show/hide .claude, mailroom and service state churn" />
          <span className="flex items-center gap-1.5 text-tiny text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", liveCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-zinc-600")} />
            {liveCount > 0 ? `${liveCount} live` : "idle"}
          </span>
        </div>
      }
    >
      {failed && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Feed unavailable</p>
      ) : allFiltered ? (
        <p className="text-xs text-muted-foreground">
          Everything is filtered — toggle <span className="font-bold">noise</span> / <span className="font-bold">temp</span> to show.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">No file changes in the last 3 hours</p>
      ) : (
        <div className={cn("overflow-y-auto scroll-smooth", layout === "columns" ? "h-[calc(100vh-168px)]" : layout === "wall" ? "h-[420px]" : "h-[60vh]")}>
          <table className="w-full table-fixed font-mono text-tiny leading-snug">
            <colgroup>
              <col className="w-3" />
              <col className="w-28" />
              <col />
              <col className="w-8" />
              <col className="w-9" />
            </colgroup>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.path}
                  className={cn(r.fresh && "animate-in fade-in slide-in-from-top-1 duration-200")}
                >
                  <td className={cn("text-center font-bold align-top", ACTION_COLOR[r.action] ?? "text-zinc-400")}>
                    {ACTION_GLYPH[r.action] ?? "~"}
                  </td>
                  <td className="truncate pl-1.5 pr-2 text-muted-foreground" title={r.project ?? ""}>
                    {r.project ?? ""}
                  </td>
                  <td className="truncate" title={`Open ${r.path}`}>
                    <button
                      onClick={() => openFile(r.path)}
                      className="max-w-full truncate text-foreground/90 hover:text-cyan-300 hover:underline"
                    >
                      {shortPath(r.path)}
                    </button>
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
