"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { isSourceStale } from "@/lib/dashboard-health";
import type { IntegrationHealth } from "@/types";

// A connection is never reported "connected" because a process is alive. It is
// reported from its own state field, with the moment we last asked and the
// moment data last actually moved shown separately. A row with no fresh check
// behind it reads unverified rather than green.

type ConnectionState = "critical" | "unverified" | "warning" | "ok";

const STATE_ORDER: Record<ConnectionState, number> = {
  critical: 0,
  unverified: 1,
  warning: 2,
  ok: 3,
};

const STATE_LABEL: Record<ConnectionState, string> = {
  critical: "Not working",
  unverified: "Unverified",
  warning: "Degraded",
  ok: "Connected",
};

const STATE_CHIP: Record<ConnectionState, string> = {
  critical: "border-red-600/40 bg-red-600/12 text-red-700 dark:text-red-300",
  unverified: "border-slate-500/40 bg-slate-500/12 text-slate-600 dark:text-slate-300",
  warning: "border-amber-600/40 bg-amber-600/12 text-amber-700 dark:text-amber-300",
  ok: "border-emerald-600/35 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
};

const STATE_ROW: Record<ConnectionState, string> = {
  critical: "border-red-600/30 bg-red-600/[0.05]",
  unverified: "border-slate-500/25 bg-slate-500/[0.04]",
  warning: "border-amber-600/30 bg-amber-600/[0.05]",
  ok: "border-border/65",
};

function tsOf(value: string | null): number | null {
  if (!value) return null;
  // SQLite writes "YYYY-MM-DD HH:MM:SS" in UTC; the agent sends ISO with offset.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function ago(value: string | null): string | null {
  const parsed = tsOf(value);
  if (parsed === null) return null;
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function stateOf(connection: IntegrationHealth): ConnectionState {
  // A stale reading cannot support a green row. A stale bad reading still
  // stands: nothing has since said the connection recovered.
  if (connection.status === "critical") return "critical";
  if (connection.status === "warning") return "warning";
  return isSourceStale(connection.last_check_at) ? "unverified" : "ok";
}

/** Split an agent fix string into steps, dropping any "1. " numbering. */
function fixSteps(fix: string): string[] {
  return fix
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function CopyStep({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is unavailable outside a secure context; the text is on
      // screen either way, so this stays silent rather than throwing.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : `Copy: ${text}`}
      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

function ConnectionRow({ connection }: { connection: IntegrationHealth }) {
  const state = stateOf(connection);
  const unhealthy = state !== "ok";
  const steps = connection.fix ? fixSteps(connection.fix) : [];
  // The fix belongs on screen at the moment the failure is seen, not one tap
  // behind it. The default is derived, not captured at mount, so a connection
  // that breaks while the dashboard is open opens its own fix.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? (unhealthy && steps.length > 0);

  const checked = ago(connection.last_check_at);
  const flow = ago(connection.last_flow_at);

  return (
    <div className={cn("rounded-lg border px-2.5 py-2", STATE_ROW[state])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-petite font-bold">{connection.integration_name}</p>
          <p className="mt-0.5 text-mini leading-snug text-muted-foreground">
            {connection.purpose || "Purpose not recorded by the collector"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-mini font-bold uppercase tracking-[0.08em]",
            STATE_CHIP[state]
          )}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      {state === "unverified" ? (
        <p className="mt-1.5 text-mini leading-snug text-muted-foreground">
          The collector has not checked this inside its window, so its state is unknown.
          Last reading{connection.details ? `: ${connection.details}` : " was healthy"}.
        </p>
      ) : (
        connection.details && (
          <p
            className={cn(
              "mt-1.5 text-mini leading-snug",
              state === "critical"
                ? "text-red-700 dark:text-red-300"
                : state === "warning"
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground"
            )}
          >
            {connection.details}
          </p>
        )
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-mini text-muted-foreground">
        <span>checked {checked ?? "never"}</span>
        <span>flow {flow ?? "not recorded"}</span>
      </div>

      {steps.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOverride(!open)}
            aria-expanded={open}
            className="flex items-center gap-1 text-mini font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
            {open ? "Hide fix" : `Show fix (${steps.length} steps)`}
          </button>

          {open && (
            <ol className="mt-1.5 space-y-1">
              {steps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex items-start gap-1.5">
                  <span className="mt-1 w-3 shrink-0 text-right font-mono text-mini text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <code className="min-w-0 flex-1 break-words rounded bg-muted/60 px-1.5 py-1 font-mono text-mini leading-snug">
                    {step}
                  </code>
                  <CopyStep text={step} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectionsWidget({ connections }: { connections: IntegrationHealth[] }) {
  if (connections.length === 0) {
    return (
      <WidgetTile title="Connections" size="md">
        <p className="text-petite text-muted-foreground">
          No connection has reported yet. Nothing here is verified.
        </p>
      </WidgetTile>
    );
  }

  const sorted = [...connections].sort(
    (a, b) =>
      STATE_ORDER[stateOf(a)] - STATE_ORDER[stateOf(b)] ||
      a.integration_name.localeCompare(b.integration_name)
  );
  const working = sorted.filter((connection) => stateOf(connection) === "ok").length;

  return (
    <WidgetTile
      title="Connections"
      size="md"
      headerRight={
        <span
          className={cn(
            "font-mono text-mini tabular-nums",
            working === sorted.length ? "text-muted-foreground" : "font-bold text-red-600 dark:text-red-400"
          )}
        >
          {working}/{sorted.length} working
        </span>
      }
    >
      <div className="space-y-1.5">
        {sorted.map((connection) => (
          <ConnectionRow key={connection.integration_name} connection={connection} />
        ))}
      </div>
    </WidgetTile>
  );
}
