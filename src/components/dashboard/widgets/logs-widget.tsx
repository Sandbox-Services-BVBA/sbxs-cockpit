"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { WidgetTile } from "../widget-tile";
import { LogsConsole } from "@/components/logs/logs-console";
import { cn } from "@/lib/utils";
import { getFsKey } from "@/lib/fs-client";
import { fetchLogSources, type LogSource } from "@/lib/logs-client";

const REFRESH_MS = 60000;
const ROWS = 7;

function fmtAge(epoch: number, now: number): string {
  if (!epoch) return "never";
  const s = Math.max(0, now - epoch);
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

// Worst first: anything with errors, then whatever is actually writing.
function rank(s: LogSource): number {
  if (s.errors24h > 0) return 0;
  if (s.running === false) return 1;
  if (s.live) return 2;
  return 3;
}

export function LogsWidget({ layout = "grid" }: { layout?: "grid" | "columns" | "wall" }) {
  const [sources, setSources] = useState<LogSource[]>([]);
  const [err, setErr] = useState("");
  const [locked, setLocked] = useState(false);
  const [open, setOpen] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    if (!getFsKey()) {
      setLocked(true);
      return;
    }
    try {
      setSources(await fetchLogSources());
      setLocked(false);
      setErr("");
    } catch (e) {
      const error = e as { status?: number; message?: string };
      if (error.status === 401) setLocked(true);
      else setErr(error.message || "Failed to load log sources");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    const t = setInterval(() => void load(), REFRESH_MS);
    const c = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  const shown = [...sources].sort((a, b) => rank(a) - rank(b) || b.errors24h - a.errors24h).slice(0, ROWS);
  const live = sources.filter((s) => s.live).length;
  const withErrors = sources.filter((s) => s.errors24h > 0).length;

  return (
    <>
      <WidgetTile
        title="Service Logs"
        size="md"
        headerRight={
          <Link href="/logs" className="text-mini text-muted-foreground hover:text-foreground">
            open console
          </Link>
        }
      >
        {locked && (
          <p className="text-petite text-muted-foreground">
            Locked.{" "}
            <Link href="/logs" className="underline hover:text-foreground">
              Enter the access key
            </Link>{" "}
            to read service logs.
          </p>
        )}
        {err && <p className="text-petite text-red-500 dark:text-red-400">{err}</p>}
        {!locked && !err && sources.length === 0 && (
          <p className="text-petite text-muted-foreground">Loading sources...</p>
        )}
        {!locked && shown.length > 0 && (
          <div className="font-mono text-petite">
            {shown.map((s) => (
              <button
                key={s.id}
                onClick={() => setOpen(s.id)}
                className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left hover:bg-muted/50"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    s.live ? "bg-emerald-500" : s.running === false ? "bg-red-500/70" : "bg-muted-foreground/30"
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-foreground/85">{s.label}</span>
                {s.errors24h > 0 && (
                  <span className="shrink-0 tabular-nums text-mini text-red-500 dark:text-red-400">
                    {s.errors24h}
                    {s.errorsPartial ? "+" : ""}
                  </span>
                )}
                <span className="w-8 shrink-0 text-right text-mini tabular-nums text-muted-foreground/50">
                  {fmtAge(s.mtime, now)}
                </span>
              </button>
            ))}
            <p className="mt-1.5 border-t border-border/50 pt-1 text-mini text-muted-foreground/70">
              {sources.length} sources · {live} writing · {withErrors} with errors (24h)
            </p>
          </div>
        )}
      </WidgetTile>
      {open && (
        <LogsModal
          key={open}
          source={open}
          fullHeight={layout !== "wall"}
          onClose={() => setOpen("")}
        />
      )}
    </>
  );
}

function LogsModal({
  source,
  fullHeight,
  onClose,
}: {
  source: string;
  fullHeight: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className={cn(
          "flex w-[94vw] flex-col border-2 border-border bg-card shadow-2xl",
          fullHeight ? "h-[88vh]" : "h-[70vh]"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-border px-3 py-1.5">
          <h3 className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">
            Service Logs
          </h3>
          <button
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center border border-border hover:bg-accent"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <LogsConsole initialSource={source} className="min-h-0 flex-1 p-2" />
      </div>
    </div>
  );
}
