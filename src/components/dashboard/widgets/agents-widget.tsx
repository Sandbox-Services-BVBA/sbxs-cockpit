"use client";

import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";

interface TmuxWindow {
  session: string;
  index: number | string;
  window: string;
  activity: number; // epoch seconds of last output
  cmd: string;
  pid: number;
  path: string;
  attached: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function ago(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function AgentsWidget() {
  const { data } = useSWR<{ windows: TmuxWindow[]; now: number; error?: string }>(
    "/api/tmux",
    fetcher,
    { refreshInterval: 5000, dedupingInterval: 2000, keepPreviousData: true }
  );

  const now = data?.now ?? Math.floor(Date.now() / 1000);
  const windows = [...(data?.windows ?? [])].sort((a, b) => b.activity - a.activity);
  const active = windows.filter((w) => now - w.activity < 60).length;

  return (
    <WidgetTile
      title="Agents"
      size="lg"
      headerRight={
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground tabular-nums">
          {active > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {active} active / {windows.length}
        </span>
      }
    >
      {windows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{data?.error ? "Dev server unreachable" : "No tmux agents"}</p>
      ) : (
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full table-fixed font-mono text-[10px] leading-snug">
            <colgroup>
              <col className="w-3" />
              <col className="w-28" />
              <col />
              <col className="w-9" />
            </colgroup>
            <tbody>
              {windows.map((w) => {
                const age = now - w.activity;
                const dot = age < 60 ? "bg-emerald-500" : age < 600 ? "bg-cyan-500" : age < 3600 ? "bg-amber-500/70" : "bg-zinc-600";
                return (
                  <tr key={`${w.session}:${w.index}`} className={cn(age < 60 && "bg-emerald-500/5")}>
                    <td className="align-top">
                      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dot, age < 60 && "animate-pulse")} />
                    </td>
                    <td className="truncate pr-2 text-foreground" title={w.session}>{w.session}</td>
                    <td className="truncate text-muted-foreground" title={`${w.window} — ${w.path}`}>{w.window}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{ago(age)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </WidgetTile>
  );
}
