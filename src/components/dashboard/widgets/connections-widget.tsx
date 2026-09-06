"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import {
  ago,
  connectionState,
  fixSteps,
  sortConnections,
  CONNECTION_LABEL as STATE_LABEL,
  type ConnectionState,
} from "@/lib/connection-state";
import type { ModuleDensity } from "@/lib/layout/types";
import type { IntegrationHealth } from "@/types";
import { cutByDensity, foldLabel } from "../infra/density";
import { DensityFold } from "../infra/density-fold";

// The wallboard's rendering of a connection. Infrastructure has its own
// converted pane; both read the same state rules from lib/connection-state.

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

function ConnectionRow({ connection, density }: { connection: IntegrationHealth; density: ModuleDensity }) {
  const state = connectionState(connection);
  const unhealthy = state !== "ok";
  const steps = connection.fix ? fixSteps(connection.fix) : [];
  // The fix belongs on screen at the moment the failure is seen, not one tap
  // behind it, and nothing here folds open: a tile is a fixed box now, so the
  // steps are simply printed and scrolled to. Full prints every fix, healthy
  // or not: it is the everything-expanded drill-down.
  const showFix = steps.length > 0 && (unhealthy || density === "full");

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

      {showFix && (
        <ol className="mt-2 space-y-1">
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
  );
}

export function ConnectionsWidget({
  connections,
  density = "standard",
}: {
  connections: IntegrationHealth[];
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (connections.length === 0) {
    return (
      <WidgetTile title="Connections" size="md">
        <p className="text-petite text-muted-foreground">
          No connection has reported yet. Nothing here is verified.
        </p>
      </WidgetTile>
    );
  }

  const sorted = sortConnections(connections);
  const working = sorted.filter((connection) => connectionState(connection) === "ok").length;
  // Unverified is not healthy: a row nobody has checked stays on screen.
  const cut = cutByDensity(sorted, density, (connection) => connectionState(connection) === "ok", expanded);

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
      {cut.rows.length > 0 && (
        <div className="space-y-1.5">
          {cut.rows.map((connection) => (
            <ConnectionRow key={connection.integration_name} connection={connection} density={density} />
          ))}
        </div>
      )}
      {cut.fold && (
        <DensityFold
          label={foldLabel(cut, "connection", "working")}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </WidgetTile>
  );
}
