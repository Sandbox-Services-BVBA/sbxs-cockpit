import type { DashboardData } from "@/hooks/use-dashboard-data";

export type CockpitTone = "healthy" | "warning" | "critical" | "unknown";

const AGENT_STALE_AFTER_MS = 15 * 60 * 1000;
const UPTIME_STALE_AFTER_MS = 20 * 60 * 1000;

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isSourceStale(value: string | null | undefined, maxAgeMs = AGENT_STALE_AFTER_MS) {
  const parsed = timestampMs(value);
  return parsed === null || Date.now() - parsed > maxAgeMs;
}

/** What the shell badge is allowed to claim about the data on screen. */
export type FeedStatus = "live" | "stale" | "offline" | "connecting";

export interface FeedState {
  status: FeedStatus;
  label: string;
  /** Age of the newest agent signal, e.g. "4m". Null when nothing has arrived. */
  age: string | null;
  /** Long form, for the badge's title and screen readers. */
  detail: string;
}

function ageLabel(value: string | null | undefined): string | null {
  const parsed = timestampMs(value);
  if (parsed === null) return null;
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// The badge reports the age of the underlying signal, never the age of the
// last page refresh. A dashboard that repaints every 30 seconds on top of a
// collector that died an hour ago must not read as live.
export function getFeedState(data: DashboardData | null, error: string | null): FeedState {
  if (!data) {
    return error
      ? { status: "offline", label: "Offline", age: null, detail: `The dashboard request failed: ${error}` }
      : { status: "connecting", label: "Connecting", age: null, detail: "Waiting for the first cockpit snapshot." };
  }

  const age = ageLabel(data.freshness.agent);
  const health = getDashboardHealth(data);

  if (health.agentStale) {
    return {
      status: "stale",
      label: "Stale",
      age,
      detail: age
        ? `The cockpit agent last delivered ${age} ago, outside its 15 minute window.`
        : "The cockpit agent has never delivered a signal.",
    };
  }

  return {
    status: "live",
    label: "Live",
    age,
    detail: `The cockpit agent delivered ${age ?? "just now"} ago.`,
  };
}

export interface DashboardHealth {
  tone: CockpitTone;
  headline: string;
  detail: string;
  attentionCount: number;
  criticalCount: number;
  warningCount: number;
  sitesUp: number;
  sitesTotal: number;
  infrastructureIssues: number;
  agentStale: boolean;
  uptimeStale: boolean;
}

export function getDashboardHealth(data: DashboardData | null): DashboardHealth {
  if (!data) {
    return {
      tone: "unknown",
      headline: "Establishing telemetry",
      detail: "Waiting for the first cockpit snapshot.",
      attentionCount: 0,
      criticalCount: 0,
      warningCount: 0,
      sitesUp: 0,
      sitesTotal: 0,
      infrastructureIssues: 0,
      agentStale: true,
      uptimeStale: true,
    };
  }

  const criticalAlerts = data.alerts.filter((alert) => alert.severity === "critical").length;
  const warningAlerts = data.alerts.filter((alert) => alert.severity === "warning").length;
  const downSites = data.uptime.filter((site) => !site.is_up).length;
  const serverIssues = data.servers.filter(
    (server) => server.disk_usage_percent >= 80 || server.ram_usage_percent >= 90 || server.cpu_usage_percent >= 90
  ).length;
  const backupIssues = data.backups.filter((backup) => backup.status !== "ok").length;
  const integrationIssues = data.integrations.filter((integration) => integration.status !== "ok").length;
  const cronIssues = data.crons.filter((cron) => cron.status !== "ok").length;
  const serviceIssues = (data.services ?? []).filter((service) => !service.running).length;
  const infrastructureIssues = serverIssues + backupIssues + integrationIssues + cronIssues + serviceIssues;
  const agentStale = isSourceStale(data.freshness.agent);
  const uptimeStale = isSourceStale(data.freshness.uptime, UPTIME_STALE_AFTER_MS);
  const criticalCount = criticalAlerts + downSites + (agentStale ? 1 : 0);
  const warningCount = warningAlerts + infrastructureIssues + (uptimeStale ? 1 : 0);
  const attentionCount = criticalCount + warningCount;

  if (agentStale) {
    return {
      tone: "critical",
      headline: "Monitoring feed is stale",
      detail: "Live agent data is outside the 15 minute reliability window.",
      attentionCount,
      criticalCount,
      warningCount,
      sitesUp: data.uptime.length - downSites,
      sitesTotal: data.uptime.length,
      infrastructureIssues,
      agentStale,
      uptimeStale,
    };
  }

  if (criticalCount > 0) {
    return {
      tone: "critical",
      headline: "Action required",
      detail: `${criticalCount} critical signal${criticalCount === 1 ? "" : "s"} need attention.`,
      attentionCount,
      criticalCount,
      warningCount,
      sitesUp: data.uptime.length - downSites,
      sitesTotal: data.uptime.length,
      infrastructureIssues,
      agentStale,
      uptimeStale,
    };
  }

  if (warningCount > 0) {
    return {
      tone: "warning",
      headline: "Operating with warnings",
      detail: `${warningCount} signal${warningCount === 1 ? "" : "s"} should be reviewed.`,
      attentionCount,
      criticalCount,
      warningCount,
      sitesUp: data.uptime.length - downSites,
      sitesTotal: data.uptime.length,
      infrastructureIssues,
      agentStale,
      uptimeStale,
    };
  }

  return {
    tone: "healthy",
    headline: "All systems nominal",
    detail: "No active exceptions across monitored operations.",
    attentionCount,
    criticalCount,
    warningCount,
    sitesUp: data.uptime.length,
    sitesTotal: data.uptime.length,
    infrastructureIssues,
    agentStale,
    uptimeStale,
  };
}
