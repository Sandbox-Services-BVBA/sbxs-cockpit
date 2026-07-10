import { Activity, CircleAlert, Globe2, Inbox, ReceiptText, ServerCog } from "lucide-react";
import { format } from "date-fns";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth, type CockpitTone } from "@/lib/dashboard-health";
import { cn } from "@/lib/utils";

const toneClasses: Record<CockpitTone, string> = {
  healthy: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  critical: "text-red-700 dark:text-red-300",
  unknown: "text-muted-foreground",
};

const postureClasses: Record<CockpitTone, string> = {
  healthy: "border-emerald-600/30 bg-emerald-600/[0.07]",
  warning: "border-amber-600/35 bg-amber-500/[0.08]",
  critical: "border-red-600/35 bg-red-600/[0.08]",
  unknown: "border-border bg-card",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function signalTime(value: string | null) {
  if (!value) return "No signal received";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "Timestamp unavailable" : `Last signal ${format(date, "dd MMM, HH:mm")}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "unknown",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone?: CockpitTone;
}) {
  return (
    <article className="cockpit-metric group">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className={cn("font-mono text-mini font-bold uppercase tracking-[0.14em]", toneClasses[tone])}>
          {tone === "healthy" ? "Clear" : tone === "unknown" ? "Standby" : "Review"}
        </span>
      </div>
      <p className="mt-5 text-tiny font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-foreground">{value}</p>
      <p className="mt-1 text-petite text-muted-foreground">{detail}</p>
    </article>
  );
}

export function CockpitPosture({ data, className }: { data: DashboardData | null; className?: string }) {
  const health = getDashboardHealth(data);

  return (
    <article className={cn("cockpit-posture", postureClasses[health.tone], className)}>
      <div className="flex items-center justify-between gap-4">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-background/70", toneClasses[health.tone])}>
          {health.tone === "critical" || health.tone === "warning" ? (
            <CircleAlert className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Activity className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <span className={cn("font-mono text-mini font-bold uppercase tracking-[0.16em]", toneClasses[health.tone])}>
          {health.tone === "healthy" ? "Nominal" : health.tone === "unknown" ? "Connecting" : "Attention"}
        </span>
      </div>
      <p className="mt-6 text-tiny font-bold uppercase tracking-[0.18em] text-muted-foreground">System posture</p>
      <h2 id="system-pulse-title" className="mt-2 max-w-md text-3xl font-black leading-[1.02] tracking-[-0.05em]">
        {health.headline}
      </h2>
      <p className="mt-3 max-w-lg text-petite text-muted-foreground">{health.detail}</p>
      <p className="mt-5 border-t border-current/10 pt-3 font-mono text-mini text-muted-foreground">
        {signalTime(data?.freshness.agent ?? null)}
      </p>
    </article>
  );
}

export function CockpitMetrics({ data, className }: { data: DashboardData | null; className?: string }) {
  const health = getDashboardHealth(data);
  const totalUnread = data?.inboxes?.reduce((sum, inbox) => sum + Math.max(0, inbox.unread), 0) ?? null;
  const unbilled = data?.unbilled ?? null;
  const sitesTone: CockpitTone = health.sitesTotal === 0
    ? "unknown"
    : health.sitesUp === health.sitesTotal
      ? "healthy"
      : "critical";
  const infraTone: CockpitTone = !data
    ? "unknown"
    : health.infrastructureIssues === 0
      ? "healthy"
      : "warning";

  return (
    <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", className)}>
      <MetricCard
        icon={Globe2}
        label="Client sites"
        value={health.sitesTotal ? `${health.sitesUp}/${health.sitesTotal}` : "--"}
        detail={health.sitesTotal ? "sites responding" : "No uptime feed"}
        tone={sitesTone}
      />
      <MetricCard
        icon={ServerCog}
        label="Infrastructure"
        value={data ? String(health.infrastructureIssues) : "--"}
        detail={health.infrastructureIssues === 1 ? "exception detected" : "exceptions detected"}
        tone={infraTone}
      />
      <MetricCard
        icon={ReceiptText}
        label="Ready to bill"
        value={unbilled ? formatCurrency(unbilled.total_amount) : "--"}
        detail={unbilled ? `${unbilled.total_hours.toFixed(1)} hours across ${unbilled.entry_count} entries` : "Billing feed unavailable"}
        tone={unbilled ? (unbilled.total_amount > 0 ? "warning" : "healthy") : "unknown"}
      />
      <MetricCard
        icon={Inbox}
        label="Communications"
        value={totalUnread === null ? "--" : String(totalUnread)}
        detail={totalUnread === null ? "Inbox feed unavailable" : "unread across connected inboxes"}
        tone={totalUnread === null ? "unknown" : totalUnread > 100 ? "warning" : "healthy"}
      />
    </div>
  );
}

export function CockpitSummary({ data }: { data: DashboardData | null }) {
  return (
    <section aria-labelledby="system-pulse-title" className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      <CockpitPosture data={data} className="col-span-2 xl:col-span-2" />
      <CockpitMetrics data={data} className="col-span-2 xl:col-span-4" />
    </section>
  );
}
