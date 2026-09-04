"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleDensity } from "@/lib/layout/types";
import {
  ago,
  connectionState,
  fixSteps,
  sortConnections,
  CONNECTION_LABEL,
  type ConnectionState,
} from "@/lib/connection-state";
import type { IntegrationHealth } from "@/types";
import { cutByDensity, foldLabel } from "./density";
import { DensityFold } from "./density-fold";
import { Pane, PaneEmpty, type PaneTone } from "./pane";

const TONE: Record<ConnectionState, PaneTone> = {
  critical: "bad",
  warning: "warn",
  unverified: "idle",
  ok: "ok",
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
      className="fix__copy"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}

function ConnectionRow({ connection, density }: { connection: IntegrationHealth; density: ModuleDensity }) {
  const state = connectionState(connection);
  const unhealthy = state !== "ok";
  const steps = connection.fix ? fixSteps(connection.fix) : [];

  // The fix belongs on screen at the moment the failure is seen, not one tap
  // behind it. The default is derived, not captured at mount, so a connection
  // that breaks while the dashboard is open opens its own fix. Full opens
  // every fix, healthy or not: it is the everything-expanded drill-down.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? (steps.length > 0 && (unhealthy || density === "full"));

  const checked = ago(connection.last_check_at);
  const flow = ago(connection.last_flow_at);

  return (
    <li className="conn" data-tone={TONE[state]}>
      <div className="conn__head">
        <div className="min-w-0">
          <p className="conn__name">{connection.integration_name}</p>
          <p className="conn__purpose">
            {connection.purpose || "Purpose not recorded by the collector"}
          </p>
        </div>
        <span className="conn__chip">{CONNECTION_LABEL[state]}</span>
      </div>

      {state === "unverified" ? (
        <p className="conn__detail">
          The collector has not checked this inside its window, so its state is unknown. Last
          reading{connection.details ? `: ${connection.details}` : " was healthy"}.
        </p>
      ) : (
        connection.details && <p className="conn__detail conn__detail--state">{connection.details}</p>
      )}

      <p className="conn__times">
        <span>checked {checked ?? "never"}</span>
        <span>flow {flow ?? "not recorded"}</span>
      </p>

      {steps.length > 0 && (
        <div className="conn__fix">
          <button
            type="button"
            onClick={() => setOverride(!open)}
            aria-expanded={open}
            className="fix__toggle"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
            {open ? "Hide fix" : `Show fix (${steps.length} steps)`}
          </button>

          {open && (
            <ol className="fix__steps">
              {steps.map((step, index) => (
                <li key={`${index}-${step}`}>
                  <span className="fix__n">{index + 1}</span>
                  <code>{step}</code>
                  <CopyStep text={step} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

export function ConnectionsPane({
  connections,
  density = "standard",
}: {
  connections: IntegrationHealth[] | undefined;
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (!connections || connections.length === 0) {
    return (
      <Pane title="Connections" readout="none reported">
        <PaneEmpty>No connection has reported yet. Nothing here is verified.</PaneEmpty>
      </Pane>
    );
  }

  const sorted = sortConnections(connections);
  const working = sorted.filter((connection) => connectionState(connection) === "ok").length;
  const broken = sorted.filter((connection) => connectionState(connection) === "critical").length;
  // Unverified is not healthy: a row nobody has checked stays on screen.
  const cut = cutByDensity(sorted, density, (connection) => connectionState(connection) === "ok", expanded);

  return (
    <Pane
      title="Connections"
      tone={broken > 0 ? "bad" : working === sorted.length ? "ok" : "idle"}
      readout={`${working}/${sorted.length} working`}
    >
      {cut.rows.length > 0 && (
        <ul className="conn-list">
          {cut.rows.map((connection) => (
            <ConnectionRow key={connection.integration_name} connection={connection} density={density} />
          ))}
        </ul>
      )}
      {cut.fold && (
        <DensityFold
          label={foldLabel(cut, "connection", "working")}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </Pane>
  );
}
