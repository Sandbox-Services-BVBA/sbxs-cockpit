"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFsKey, setFsKey } from "@/lib/fs-client";
import { fetchLogSources, fetchLogTail, type LogSource, type LogTail } from "@/lib/logs-client";
import {
  diffTokens,
  levelRank,
  lineLevel,
  splitTokens,
  toEvents,
  toRecords,
  type LogEvent,
  type LogLevel,
  type LogRecord,
} from "@/lib/log-events";

const LINE_CHOICES = [200, 500, 1000, 2000];
const TAIL_REFRESH_MS = 15000;
const SOURCE_REFRESH_MS = 60000;
const BODY_PREVIEW_LINES = 8;

type Mode = "events" | "raw";
type MinLevel = "" | "warn" | "error";

const LEVEL_TEXT: Record<LogLevel, string> = {
  error: "text-red-500 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
  info: "text-foreground/80",
};

const LEVEL_BAR: Record<LogLevel, string> = {
  error: "bg-red-500/70",
  warn: "bg-amber-500/70",
  info: "bg-transparent",
};

function fmtSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n}b`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}k`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

function fmtAge(epoch: number, now: number): string {
  if (!epoch) return "never";
  const s = Math.max(0, now - epoch);
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

function fmtClock(d: Date | null): string {
  if (!d) return "--:--:--";
  return d.toLocaleTimeString("nl-BE", { hour12: false });
}

function fmtDay(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit" });
}

function recordText(rec: LogRecord): string {
  return rec.extra.length ? `${rec.head}\n${rec.extra.join("\n")}` : rec.head;
}

// ─── Unlock gate (same key as the file explorer) ────────────────────────────
function KeyGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value.trim()) return;
    setFsKey(value.trim());
    setValue("");
    onUnlock();
  };
  return (
    <div className="flex max-w-sm flex-col gap-2 py-2">
      <p className="text-petite text-muted-foreground">
        Service logs are read-only and gated by the same access key as the file browser.
      </p>
      <div className="flex gap-1">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="FS access key"
          className="flex-1 border-2 border-border bg-input px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none"
        />
        <button
          onClick={submit}
          className="border-2 border-primary bg-primary px-3 py-1 text-petite font-bold uppercase text-primary-foreground"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

// ─── Source picker ──────────────────────────────────────────────────────────
const KIND_LABEL: Record<LogSource["kind"], string> = {
  pm2: "pm2 services",
  journal: "system units",
  file: "files",
};

function SourceList({
  sources,
  selected,
  now,
  onSelect,
}: {
  sources: LogSource[];
  selected: string;
  now: number;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return sources.filter((s) => {
      if (liveOnly && !s.live) return false;
      if (errorsOnly && s.errors24h === 0) return false;
      if (needle && !`${s.label} ${s.service} ${s.id}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [sources, filter, liveOnly, errorsOnly]);

  const groups = useMemo(() => {
    const order: LogSource["kind"][] = ["pm2", "journal", "file"];
    return order
      .map((kind) => ({ kind, items: shown.filter((s) => s.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [shown]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 pb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter services"
          className="w-full border border-border bg-input px-2 py-1 font-mono text-mini focus:border-primary focus:outline-none"
        />
        <div className="flex gap-1">
          <Chip active={liveOnly} onClick={() => setLiveOnly((v) => !v)}>live</Chip>
          <Chip active={errorsOnly} onClick={() => setErrorsOnly((v) => !v)}>errors</Chip>
          <span className="ml-auto self-center text-mini tabular-nums text-muted-foreground/60">
            {shown.length}/{sources.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.kind} className="mb-2">
            <p className="px-1 py-1 text-mini font-bold uppercase tracking-[0.16em] text-muted-foreground/60">
              {KIND_LABEL[g.kind]}
            </p>
            {g.items.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={cn(
                  "flex w-full items-center gap-1.5 px-1 py-1 text-left hover:bg-muted/50",
                  selected === s.id && "bg-primary/15"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    s.live ? "bg-emerald-500" : s.running === false ? "bg-red-500/70" : "bg-muted-foreground/30"
                  )}
                  title={s.live ? "writing" : s.status || "quiet"}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-petite text-foreground/85">
                  {s.label}
                  {s.stream === "err" && (
                    <span className="ml-1 text-mini text-red-500/70 dark:text-red-400/70">err</span>
                  )}
                </span>
                {s.errors24h > 0 && (
                  <span
                    className="shrink-0 text-mini tabular-nums text-red-500 dark:text-red-400"
                    title={`${s.errors24h}${s.errorsPartial ? "+" : ""} error lines in the last 24h`}
                  >
                    {s.errors24h}
                    {s.errorsPartial ? "+" : ""}
                  </span>
                )}
                <span className="w-8 shrink-0 text-right text-mini tabular-nums text-muted-foreground/50">
                  {fmtAge(s.mtime, now)}
                </span>
              </button>
            ))}
          </div>
        ))}
        {shown.length === 0 && <p className="px-1 text-petite text-muted-foreground">no sources match</p>}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "border px-1.5 py-0.5 text-mini font-bold uppercase tracking-wide",
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ─── Event row ──────────────────────────────────────────────────────────────
function EventRow({
  event,
  tokens,
  changed,
  expanded,
  onToggle,
}: {
  event: LogEvent;
  tokens: string[];
  changed: boolean[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const body = event.sample.extra;
  const shownBody = expanded ? body : body.slice(0, BODY_PREVIEW_LINES);
  const hiddenBody = body.length - shownBody.length;

  return (
    <div className="flex gap-2 border-b border-border/40 px-1 py-1 last:border-b-0 hover:bg-muted/30">
      <span className={cn("mt-0.5 w-0.5 shrink-0 self-stretch", LEVEL_BAR[event.level])} />
      <span
        className="shrink-0 pt-px text-mini tabular-nums text-muted-foreground/60"
        title={event.from ? event.from.toISOString() : "no timestamp"}
      >
        {fmtClock(event.from)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words", LEVEL_TEXT[event.level])}>
            {tokens.map((t, i) =>
              changed[i] ? (
                <span key={i} className="bg-primary/15 text-foreground">
                  {t}
                </span>
              ) : (
                <span key={i} className={event.count > 1 ? "opacity-70" : undefined}>
                  {t}
                </span>
              )
            )}
          </p>
          {event.count > 1 && (
            <span
              className="shrink-0 whitespace-nowrap text-mini tabular-nums text-muted-foreground/70"
              title={`${event.count} identical lines, ${fmtDay(event.from)} ${fmtClock(event.from)} to ${fmtClock(event.to)}`}
            >
              x{event.count} until {fmtClock(event.to)}
            </span>
          )}
        </div>
        {body.length > 0 && (
          <button
            onClick={onToggle}
            className="mt-0.5 block w-full cursor-pointer text-left"
            title={expanded ? "collapse" : "expand"}
          >
            <span className="block whitespace-pre-wrap break-words border-l border-border/60 pl-2 text-mini text-muted-foreground">
              {shownBody.join("\n")}
              {hiddenBody > 0 && `\n+ ${hiddenBody} more lines`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Console ────────────────────────────────────────────────────────────────
export function LogsConsole({
  initialSource,
  className,
}: {
  initialSource?: string;
  className?: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [sources, setSources] = useState<LogSource[]>([]);
  const [sourcesErr, setSourcesErr] = useState("");
  const [selected, setSelected] = useState(initialSource || "");

  const [mode, setMode] = useState<Mode>("events");
  const [lines, setLines] = useState(500);
  const [query, setQuery] = useState("");
  const [deep, setDeep] = useState(false);
  const [minLevel, setMinLevel] = useState<MinLevel>("");

  const [tail, setTail] = useState<LogTail | null>(null);
  const [tailErr, setTailErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rawRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (getFsKey()) setUnlocked(true);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(t);
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const list = await fetchLogSources();
      setSources(list);
      setSourcesErr("");
      setSelected((cur) => cur || list.find((s) => s.live)?.id || list[0]?.id || "");
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err.status === 401) {
        setFsKey("");
        setUnlocked(false);
        setSourcesErr("Wrong access key.");
      } else {
        setSourcesErr(err.message || "Failed to list sources");
      }
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    void loadSources();
    const t = setInterval(() => void loadSources(), SOURCE_REFRESH_MS);
    return () => clearInterval(t);
  }, [unlocked, loadSources]);

  // The server-side filter scans a wider window but returns matching lines only,
  // so it is opt-in ("deep") and the default search stays client-side over the
  // loaded tail, where multi-line records survive intact.
  const deepQuery = deep ? query.trim() : "";
  const deepLevel = deep ? minLevel : "";

  const loadTail = useCallback(
    async (signal?: AbortSignal) => {
      if (!selected) return;
      setLoading(true);
      try {
        const data = await fetchLogTail(
          selected,
          { lines, q: deepQuery || undefined, level: deepLevel || undefined },
          signal
        );
        setTail(data);
        setTailErr(data.error || "");
        setLoadedAt(Date.now());
      } catch (e) {
        if (signal?.aborted) return;
        const err = e as { status?: number; message?: string };
        if (err.status === 401) {
          setFsKey("");
          setUnlocked(false);
        }
        setTail(null);
        setTailErr(err.message || "Failed to read log");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [selected, lines, deepQuery, deepLevel]
  );

  useEffect(() => {
    if (!unlocked || !selected) return;
    const ctrl = new AbortController();
    void loadTail(ctrl.signal);
    return () => ctrl.abort();
  }, [unlocked, selected, loadTail]);

  useEffect(() => {
    if (!auto || !unlocked || !selected) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void loadTail();
    }, TAIL_REFRESH_MS);
    return () => clearInterval(t);
  }, [auto, unlocked, selected, loadTail]);

  const source = tail?.source || sources.find((s) => s.id === selected) || null;
  const stream = source?.stream ?? "out";

  const records = useMemo(() => toRecords(tail?.lines ?? [], stream), [tail, stream]);

  const filtered = useMemo(() => {
    let out = records;
    const needle = deep ? "" : query.trim().toLowerCase();
    if (needle) out = out.filter((r) => recordText(r).toLowerCase().includes(needle));
    if (!deep && minLevel) {
      const want = levelRank(minLevel as LogLevel);
      out = out.filter((r) => levelRank(r.level) >= want);
    }
    return out;
  }, [records, query, minLevel, deep]);

  const rows = useMemo(() => {
    const events = toEvents(filtered);
    return events
      .map((event, i) => ({
        event,
        tokens: splitTokens(event.sample.head),
        changed: diffTokens(event.sample.head, events[i - 1]?.sample.head),
      }))
      .reverse();
  }, [filtered]);

  const errorCount = useMemo(() => filtered.filter((r) => r.level === "error").length, [filtered]);

  useEffect(() => {
    if (mode !== "raw" || !rawRef.current) return;
    rawRef.current.scrollTop = rawRef.current.scrollHeight;
  }, [mode, tail]);

  useEffect(() => {
    setExpanded(new Set());
  }, [selected]);

  const toggleExpanded = (key: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!unlocked) {
    return (
      <div className={className}>
        {sourcesErr && <p className="text-petite text-red-500 dark:text-red-400">{sourcesErr}</p>}
        <KeyGate onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  const rawLines = tail?.lines ?? [];
  const shownRaw = deep
    ? rawLines
    : rawLines.filter((l) => {
        if (query.trim() && !l.toLowerCase().includes(query.trim().toLowerCase())) return false;
        return true;
      });

  return (
    <div className={cn("flex min-h-0 flex-col gap-3 lg:flex-row", className)}>
      <aside className="flex min-h-0 shrink-0 flex-col border-b border-border/60 pb-2 lg:h-full lg:w-64 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
        <div className="max-h-56 min-h-0 lg:max-h-none lg:flex-1">
          <SourceList sources={sources} selected={selected} now={now} onSelect={setSelected} />
        </div>
        {sourcesErr && (
          <p className="shrink-0 pt-1 text-mini text-red-500 dark:text-red-400">{sourcesErr}</p>
        )}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 space-y-1.5 pb-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="font-mono text-petite font-bold text-foreground">
              {source?.label || "no source"}
              {source?.stream === "err" && (
                <span className="ml-1 text-mini text-red-500/80 dark:text-red-400/80">stderr</span>
              )}
            </h4>
            {source && (
              <span className="text-mini text-muted-foreground/70">
                {source.kind === "journal" ? "journald" : fmtSize(source.size)}
                {source.status ? ` · ${source.status}` : ""}
                {source.mtime ? ` · ${fmtAge(source.mtime, now)} ago` : ""}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Chip active={mode === "events"} onClick={() => setMode("events")} title="collapse repeats, show changes">
                events
              </Chip>
              <Chip active={mode === "raw"} onClick={() => setMode("raw")} title="literal last N lines">
                raw
              </Chip>
              <Chip active={auto} onClick={() => setAuto((v) => !v)} title="auto-refresh every 15s">
                auto
              </Chip>
              <button
                onClick={() => void loadTail()}
                title="refresh now"
                className="border border-border p-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex min-w-40 flex-1 items-center gap-1 border border-border bg-input px-1.5">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={deep ? "search whole tail on the server" : "search loaded lines"}
                className="w-full bg-transparent py-1 font-mono text-mini focus:outline-none"
              />
            </div>
            <Chip
              active={deep}
              onClick={() => setDeep((v) => !v)}
              title="scan up to 1 MB on the server instead of the loaded tail; returns matching lines only"
            >
              deep
            </Chip>
            <Chip active={minLevel === "warn"} onClick={() => setMinLevel((v) => (v === "warn" ? "" : "warn"))}>
              warn+
            </Chip>
            <Chip active={minLevel === "error"} onClick={() => setMinLevel((v) => (v === "error" ? "" : "error"))}>
              errors
            </Chip>
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              className="border border-border bg-input px-1 py-0.5 text-mini focus:outline-none"
              title="lines to tail"
            >
              {LINE_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n} lines
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 text-mini text-muted-foreground/70">
            <span className="tabular-nums">
              {mode === "events"
                ? `${filtered.length} lines collapsed to ${rows.length} events`
                : `${shownRaw.length} lines`}
            </span>
            {errorCount > 0 && (
              <span className="tabular-nums text-red-500 dark:text-red-400">{errorCount} error lines</span>
            )}
            {tail && !tail.fromStart && source?.kind !== "journal" && (
              <span title={`read the last ${fmtSize(tail.scanned)} of the file`}>
                tail only ({fmtSize(tail.scanned)} scanned)
              </span>
            )}
            {tail?.capped && <span>payload capped</span>}
            {deep && <span>deep scan: matching lines only</span>}
            {loadedAt > 0 && <span className="ml-auto">updated {fmtAge(Math.floor(loadedAt / 1000), now)} ago</span>}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden border border-border bg-background">
          {tailErr && <p className="p-2 text-petite text-red-500 dark:text-red-400">{tailErr}</p>}
          {!tailErr && !selected && <p className="p-2 text-petite text-muted-foreground">Pick a service.</p>}

          {!tailErr && selected && mode === "events" && (
            <div className="h-full overflow-auto font-mono text-petite leading-[1.5]">
              {rows.length === 0 && (
                <p className="p-2 text-petite text-muted-foreground">
                  {records.length === 0 ? "This source is empty." : "Nothing matches the filter."}
                </p>
              )}
              {rows.map(({ event, tokens, changed }, i) => (
                <EventRow
                  key={`${event.key}-${event.sample.index}-${i}`}
                  event={event}
                  tokens={tokens}
                  changed={changed}
                  expanded={expanded.has(`${event.key}-${event.sample.index}`)}
                  onToggle={() => toggleExpanded(`${event.key}-${event.sample.index}`)}
                />
              ))}
            </div>
          )}

          {!tailErr && selected && mode === "raw" && (
            <div ref={rawRef} className="h-full overflow-auto font-mono text-petite leading-[1.5]">
              {shownRaw.length === 0 && (
                <p className="p-2 text-petite text-muted-foreground">
                  {rawLines.length === 0 ? "This source is empty." : "Nothing matches the filter."}
                </p>
              )}
              {shownRaw.map((line, i) => {
                const level = lineLevel(line, stream);
                return (
                  <p
                    key={i}
                    className={cn(
                      "whitespace-pre-wrap break-words px-2",
                      level === "error"
                        ? "text-red-500 dark:text-red-400"
                        : level === "warn"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground/80"
                    )}
                  >
                    {line}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
