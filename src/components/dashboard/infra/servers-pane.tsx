"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ModuleDensity } from "@/lib/layout/types";
import type { ServerHealth } from "@/types";
import { cutByDensity, foldLabel } from "./density";
import { DensityFold } from "./density-fold";
import { Pane, PaneEmpty, type PaneTone } from "./pane";

// Thresholds are the same ones dashboard-health.ts counts as infrastructure
// exceptions, so a node reading amber here is a node that is also raising a
// signal in the attention queue.
const WARN = 80;
const BAD = 90;

function level(value: number | null): PaneTone {
  if (value == null) return "idle";
  if (value >= BAD) return "bad";
  if (value >= WARN) return "warn";
  return "ok";
}

function worstOf(server: ServerHealth): number {
  return Math.max(
    server.disk_usage_percent ?? 0,
    server.ram_usage_percent,
    server.cpu_usage_percent
  );
}

function nodeTone(server: ServerHealth): PaneTone {
  if (server.node_status === "stopped") return "idle";
  if (server.node_status !== "running") return "bad";
  return level(worstOf(server));
}

function Meter({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="meter" data-tone={level(value)}>
      <span className="meter__label">{label}</span>
      <span className="meter__track">
        <span className="meter__fill" style={{ width: `${value == null ? 0 : Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <span className="meter__value">{value == null ? "--" : `${Math.round(value)}%`}</span>
    </div>
  );
}

function uptimeLabel(seconds: number): string {
  if (!seconds || seconds < 0) return "unknown";
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `up ${days}d`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `up ${hours}h`;
  return `up ${Math.max(1, Math.floor(seconds / 60))}m`;
}

function Node({ server, density }: { server: ServerHealth; density: ModuleDensity }) {
  // A node is only as healthy as its worst reading; the headline says so
  // rather than leaving Bob to scan three bars for the one that is red.
  const tone = nodeTone(server);
  // A flagged node's state slot carries the flag, so its uptime moves to the
  // foot. Full prints it there for every node.
  const footUptime = server.node_status === "running" && (tone !== "ok" || density === "full");
  const identity = server.node_kind === "vm" && server.vm_id != null ? `VM ${server.vm_id}` : null;
  const state = server.node_status !== "running"
    ? server.node_status.replace("-", " ")
    : tone === "bad"
      ? "at limit"
      : tone === "warn"
        ? "tight"
        : uptimeLabel(server.uptime_seconds);
  const disk = server.disk_used_gb == null || server.disk_usage_percent == null
    ? `${Math.round(server.disk_total_gb)} GB allocated · disk usage unavailable`
    : `${Math.round(server.disk_used_gb)} of ${Math.round(server.disk_total_gb)} GB used`;

  return (
    <article className="node" data-tone={tone}>
      <div className="node__head">
        <h3 className="serif node__name">{server.server_name}</h3>
        <span className={cn("node__state", (tone === "warn" || tone === "bad") && "node__state--flag")}>
          {state}
        </span>
      </div>
      <Meter label="disk" value={server.disk_usage_percent} />
      <Meter label="ram" value={server.ram_usage_percent} />
      <Meter label="cpu" value={server.cpu_usage_percent} />
      <p className="node__foot">
        {identity && `${identity} · `}{disk}
        {footUptime && ` · ${uptimeLabel(server.uptime_seconds)}`}
      </p>
    </article>
  );
}

export function ServersPane({
  servers,
  density = "standard",
}: {
  servers: ServerHealth[] | undefined;
  density?: ModuleDensity;
}) {
  // Local only: "Show all" must not write to the profile and resets on reload.
  const [expanded, setExpanded] = useState(false);

  if (!servers || servers.length === 0) {
    return (
      <Pane title="Servers" readout="no nodes">
        <PaneEmpty>
          No node has reported disk, memory or load. Nothing on this pane is being measured.
        </PaneEmpty>
      </Pane>
    );
  }

  const flagged = servers.filter((server) => nodeTone(server) === "warn" || nodeTone(server) === "bad").length;
  const vmCount = servers.filter((server) => server.node_kind === "vm").length;

  // Worst first: a node at its limit should never sit below a healthy one.
  const sorted = [...servers].sort(
    (a, b) => {
      const rank = (server: ServerHealth) => nodeTone(server) === "bad" ? 3 : nodeTone(server) === "warn" ? 2 : nodeTone(server) === "ok" ? 1 : 0;
      return rank(b) - rank(a) || worstOf(b) - worstOf(a) || a.server_name.localeCompare(b.server_name);
    }
  );
  const cut = cutByDensity(sorted, density, (server) => ["ok", "idle"].includes(nodeTone(server)), expanded);

  return (
    <Pane
      title="Servers"
      tone={flagged > 0 ? "warn" : "ok"}
      readout={flagged > 0 ? `${flagged} tight · ${servers.length} nodes` : `${servers.length} nodes · ${vmCount} VMs`}
    >
      {cut.rows.length > 0 && (
        <div className="node-grid">
          {cut.rows.map((server) => (
            <Node key={server.server_name} server={server} density={density} />
          ))}
        </div>
      )}
      {cut.fold && (
        <DensityFold
          label={foldLabel(cut, "node", "with headroom")}
          total={cut.total}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </Pane>
  );
}
