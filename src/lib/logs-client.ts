"use client";

// Browser helpers for the read-only log API. Shares the FS access key with the
// file explorer (entered once, kept in localStorage, sent as x-fs-key).

import { getFsKey } from "./fs-client";
import type { LogStream } from "./log-events";

export interface LogSource {
  id: string;
  label: string;
  service: string;
  kind: "pm2" | "journal" | "file";
  stream: LogStream;
  exists: boolean;
  size: number;
  mtime: number;
  live: boolean;
  status: string | null;
  running: boolean | null;
  errors24h: number;
  errorsPartial: boolean;
}

export interface LogTail {
  source: LogSource;
  lines: string[];
  count: number;
  requested: number;
  q: string;
  level: string;
  capped: boolean;
  now: number;
  size: number;
  mtime: number;
  scanned: number;
  fromStart: boolean;
  exists: boolean;
  error?: string;
}

async function logsFetch<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { headers: { "x-fs-key": getFsKey() }, cache: "no-store", signal });
  const data = await r.json();
  if (!r.ok) {
    throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
  }
  return data as T;
}

export async function fetchLogSources(signal?: AbortSignal): Promise<LogSource[]> {
  const data = await logsFetch<{ sources: LogSource[] }>("/api/logs/sources", signal);
  return data.sources || [];
}

export interface TailOptions {
  lines?: number;
  /** server-side filter: scans a wider window but returns matching lines only */
  q?: string;
  level?: string;
}

export async function fetchLogTail(
  source: string,
  opts: TailOptions = {},
  signal?: AbortSignal
): Promise<LogTail> {
  const qs = new URLSearchParams({ source });
  if (opts.lines) qs.set("lines", String(opts.lines));
  if (opts.q) qs.set("q", opts.q);
  if (opts.level) qs.set("level", opts.level);
  return logsFetch<LogTail>(`/api/logs?${qs.toString()}`, signal);
}
