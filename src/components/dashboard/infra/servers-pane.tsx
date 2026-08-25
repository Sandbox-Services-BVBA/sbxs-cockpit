"use client";

import { cn } from "@/lib/utils";
import type { ServerHealth } from "@/types";
import { Pane, PaneEmpty, type PaneTone } from "./pane";

// Thresholds are the same ones dashboard-health.ts counts as infrastructure
// exceptions, so a node reading amber here is a node that is also raising a
// signal in the attention queue.
const WARN = 80;
const BAD = 90;

function level(value: number): PaneTone {
  if (value >= BAD) return "bad";
  if (value >= WARN) return "warn";
  return "ok";
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter" data-tone={level(value)}>
      <span className="meter__label">{label}</span>
      <span className="meter__track">
        <span className="meter__fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <span className="meter__value">{Math.round(value)}%</span>
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

function Node({ server }: { server: ServerHealth }) {
  // A node is only as healthy as its worst reading; the headline says so
  // rather than leaving Bob to scan three bars for the one that is red.
  const worst = Math.max(server.disk_usage_percent, server.ram_usage_percent, server.cpu_usage_percent);
  const tone = level(worst);

  return (
    <article className="node" data-tone={tone}>
      <div className="node__head">
        <h3 className="serif node__name">{server.server_name}</h3>
        <span className={cn("node__state", tone !== "ok" && "node__state--flag")}>
          {tone === "bad" ? "at limit" : tone === "warn" ? "tight" : uptimeLabel(server.uptime_seconds)}
        </span>
      </div>
      <Meter label="disk" value={server.disk_usage_percent} />
      <Meter label="ram" value={server.ram_usage_percent} />
      <Meter label="cpu" value={server.cpu_usage_percent} />
      <p className="node__foot">
        {Math.round(server.disk_used_gb)} of {Math.round(server.disk_total_gb)} GB used
        {tone !== "ok" && ` · ${uptimeLabel(server.uptime_seconds)}`}
      </p>
    </article>
  );
}

export function ServersPane({ servers }: { servers: ServerHealth[] | undefined }) {
  if (!servers || servers.length === 0) {
    return (
      <Pane title="Servers" wide readout="no nodes">
        <PaneEmpty>
          No node has reported disk, memory or load. Nothing on this pane is being measured.
        </PaneEmpty>
      </Pane>
    );
  }

  const flagged = servers.filter(
    (server) =>
      level(
        Math.max(server.disk_usage_percent, server.ram_usage_percent, server.cpu_usage_percent)
      ) !== "ok"
  ).length;

  // Worst first: a node at its limit should never sit below a healthy one.
  const sorted = [...servers].sort((a, b) => {
    const worstA = Math.max(a.disk_usage_percent, a.ram_usage_percent, a.cpu_usage_percent);
    const worstB = Math.max(b.disk_usage_percent, b.ram_usage_percent, b.cpu_usage_percent);
    return worstB - worstA || a.server_name.localeCompare(b.server_name);
  });

  return (
    <Pane
      title="Servers"
      wide
      tone={flagged > 0 ? "warn" : "ok"}
      readout={flagged > 0 ? `${flagged} of ${servers.length} tight` : `${servers.length} nodes clear`}
    >
      <div className="node-grid">
        {sorted.map((server) => (
          <Node key={server.server_name} server={server} />
        ))}
      </div>
    </Pane>
  );
}
