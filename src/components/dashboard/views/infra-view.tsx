"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { connectionState } from "@/lib/connection-state";
import { VIEW_BY_ID } from "@/lib/views";
import { ServersPane } from "../infra/servers-pane";
import { BackupsPane } from "../infra/backups-pane";
import { ConnectionsPane } from "../infra/connections-pane";
import { CronsPane } from "../infra/crons-pane";
import { ServicesPane } from "../infra/services-pane";
import { SourceFreshnessNotice, ViewError, ViewLede, ViewSkeleton } from "./view-chrome";

function Tally({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="tally">
      <p className="eyebrow">{label}</p>
      <p className="serif tally__value">{value}</p>
      <p className="tally__note">{note}</p>
    </div>
  );
}

/**
 * Infrastructure, converted to the new visual language: panes sized to their
 * contents rather than uniform cards forced into a six-column grid. Connections
 * is the tall one because it is the pane that carries a fix.
 */
export function InfraView() {
  const { data, loading, error } = useDashboardData();
  const health = getDashboardHealth(data);

  if (loading && !data) {
    return (
      <div className="cockpit-view space-y-4">
        <ViewLede>{VIEW_BY_ID.infra.description}</ViewLede>
        <ViewSkeleton />
      </div>
    );
  }

  const servers = data?.servers ?? [];
  const connections = data?.integrations ?? [];
  const services = data?.services;
  const nodesTight = servers.filter(
    (server) =>
      server.disk_usage_percent >= 80 ||
      server.ram_usage_percent >= 80 ||
      server.cpu_usage_percent >= 80
  ).length;
  const connectionsWorking = connections.filter(
    (connection) => connectionState(connection) === "ok"
  ).length;
  const servicesDown = (services ?? []).filter((service) => !service.running).length;
  const backupsStale = (data?.backups ?? []).filter((backup) => backup.status !== "ok").length;

  return (
    <div className="cockpit-view space-y-4">
      <ViewLede>{VIEW_BY_ID.infra.description}</ViewLede>
      {error && <ViewError message={error} />}
      <SourceFreshnessNotice agentStale={health.agentStale} uptimeStale={false} />

      <section className="tally-strip" aria-label="Infrastructure rollup">
        <Tally
          label="Nodes"
          value={servers.length ? `${servers.length - nodesTight}/${servers.length}` : "--"}
          note={servers.length ? "with headroom" : "none reporting"}
        />
        <Tally
          label="Connections"
          value={connections.length ? `${connectionsWorking}/${connections.length}` : "--"}
          note={connections.length ? "verified working" : "none reporting"}
        />
        <Tally
          label="Services"
          value={services ? `${services.length - servicesDown}/${services.length}` : "--"}
          note={services ? "running" : "not reported"}
        />
        <Tally
          label="Backups"
          value={data?.backups?.length ? `${data.backups.length - backupsStale}/${data.backups.length}` : "--"}
          note={data?.backups?.length ? "inside window" : "none reporting"}
        />
      </section>

      {/* Panes are sized to their contents. Servers and Connections are the
          two that earn the full width: one is a row of nodes, the other is the
          pane that carries a fix and is read most often. */}
      <div className="infra-grid">
        <ServersPane servers={data?.servers} />
        <ServicesPane services={services} />
        <div className="infra-grid__stack">
          <BackupsPane backups={data?.backups} />
          <CronsPane crons={data?.crons} />
        </div>
        <ConnectionsPane connections={data?.integrations} />
      </div>
    </div>
  );
}
