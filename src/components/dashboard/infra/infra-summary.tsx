"use client";

import type { DashboardData } from "@/hooks/use-dashboard-data";
import { connectionState } from "@/lib/connection-state";

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
 * The Infrastructure rollup: four fractions so the denominator is visible.
 * A bare "3" would not say three out of how many. It is the `infra.summary`
 * placement, so Bob can move or hide it like any other module.
 */
export function InfraSummary({ data }: { data: DashboardData }) {
  const servers = data.servers ?? [];
  const connections = data.integrations ?? [];
  const services = data.services;
  const backups = data.backups ?? [];

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
  const backupsStale = backups.filter((backup) => backup.status !== "ok").length;

  return (
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
        value={backups.length ? `${backups.length - backupsStale}/${backups.length}` : "--"}
        note={backups.length ? "inside window" : "none reporting"}
      />
    </section>
  );
}
