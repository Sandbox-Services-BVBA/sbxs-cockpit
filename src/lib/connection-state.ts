import { isSourceStale } from "./dashboard-health";
import type { IntegrationHealth } from "@/types";

// A connection is never reported "connected" because a process is alive. It is
// reported from its own state field, with the moment we last asked and the
// moment data last actually moved kept separate. A row with no fresh check
// behind it reads unverified rather than green.

export type ConnectionState = "critical" | "unverified" | "warning" | "ok";

export const CONNECTION_ORDER: Record<ConnectionState, number> = {
  critical: 0,
  unverified: 1,
  warning: 2,
  ok: 3,
};

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  critical: "Not working",
  unverified: "Unverified",
  warning: "Degraded",
  ok: "Connected",
};

export function connectionState(connection: IntegrationHealth): ConnectionState {
  // A stale reading cannot support a green row. A stale bad reading still
  // stands: nothing has since said the connection recovered.
  if (connection.status === "critical") return "critical";
  if (connection.status === "warning") return "warning";
  return isSourceStale(connection.last_check_at) ? "unverified" : "ok";
}

export function sortConnections(connections: IntegrationHealth[]): IntegrationHealth[] {
  return [...connections].sort(
    (a, b) =>
      CONNECTION_ORDER[connectionState(a)] - CONNECTION_ORDER[connectionState(b)] ||
      a.integration_name.localeCompare(b.integration_name)
  );
}

/** Split an agent fix string into steps, dropping any "1. " numbering. */
export function fixSteps(fix: string): string[] {
  return fix
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function timestampMs(value: string | null): number | null {
  if (!value) return null;
  // SQLite writes "YYYY-MM-DD HH:MM:SS" in UTC; the agent sends ISO with offset.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/** "4m ago" / "3h ago" / "9d ago", or null when the timestamp is unusable. */
export function ago(value: string | null): string | null {
  const parsed = timestampMs(value);
  if (parsed === null) return null;
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
