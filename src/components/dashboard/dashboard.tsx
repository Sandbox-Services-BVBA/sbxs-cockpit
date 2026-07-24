"use client";

import { Fragment, startTransition, useState } from "react";
import { ArrowUpRight, RadioTower, ShieldCheck } from "lucide-react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getDashboardHealth } from "@/lib/dashboard-health";
import { DashboardHeader } from "./header";
import { CockpitSummary } from "./cockpit-summary";
import {
  CockpitRail,
  MobileCockpitNav,
  VIEW_META,
  type DashboardView,
} from "./cockpit-navigation";
import { AlertsSummaryWidget } from "./widgets/alerts-summary-widget";
import { ServersWidget } from "./widgets/servers-widget";
import { BackupsWidget } from "./widgets/backups-widget";
import { CronsWidget } from "./widgets/crons-widget";
import { UptimeGridWidget } from "./widgets/uptime-grid-widget";
import { ProjectsWidget } from "./widgets/projects-widget";
import { IntegrationsWidget } from "./widgets/integrations-widget";
import { UmamiWidget } from "./widgets/umami-widget";
import { SobrietyWidget } from "./widgets/sobriety-widget";
import { WeightWidget } from "./widgets/weight-widget";
import { DomainsWidget } from "./widgets/domains-widget";
import { InboxWidget } from "./widgets/inbox-widget";
import { CityScreensWidget } from "./widgets/cityscreens-widget";
import { MailroomWidget } from "./widgets/mailroom-widget";
import { WhatsAppWidget } from "./widgets/whatsapp-widget";
import { UnbilledWidget } from "./widgets/unbilled-widget";
import { TimeEntriesWidget } from "./widgets/timeentries-widget";
import { BtcWidget } from "./widgets/btc-widget";
import { BankWidget } from "./widgets/bank-widget";
import { FileActivityWidget } from "./widgets/file-activity-widget";
import { ServicesWidget } from "./widgets/services-status-widget";
import { AgentsWidget } from "./widgets/agents-widget";
import { AiUsageWidget } from "./widgets/ai-usage-widget";
import { FileTreeWidget, FileModal } from "./widgets/file-explorer-widget";
import { HomeControlWidget } from "./widgets/home-control-widget";
import { HouseConsole } from "./house-console";
import {
  DEFAULT_WIDGETS,
  type LayoutMode,
  type WidgetCategory,
  type WidgetConfig,
} from "@/lib/widget-registry";

const SECTION_GRID = "grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-6";

// Wallboard omits private health, bank balances, files, and write controls.
const WALLBOARD_IDS = new Set([
  "uptime-grid",
  "cityscreens",
  "domains",
  "servers",
  "backups",
  "integrations",
  "crons",
  "services",
  "inbox",
  "mailroom",
]);

function SourceFreshnessNotice({ agentStale, uptimeStale }: { agentStale: boolean; uptimeStale: boolean }) {
  if (!agentStale && !uptimeStale) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-600/30 bg-red-600/[0.08] px-4 py-3 text-red-800 dark:text-red-200">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600/10">
        <RadioTower className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-petite font-bold">Live telemetry is not trustworthy</p>
        <p className="mt-0.5 text-tiny leading-relaxed text-red-800/75 dark:text-red-200/75">
          {agentStale
            ? "The cockpit agent has not delivered data inside its 15 minute window. Values below are retained for context, not presented as current."
            : "The uptime feed is outside its 20 minute window. Site availability may be out of date."}
        </p>
      </div>
    </div>
  );
}

function SectionHeading({
  category,
  index,
  count,
  preview,
  onOpen,
}: {
  category: WidgetCategory;
  index: number;
  count: number;
  preview: boolean;
  onOpen: () => void;
}) {
  const meta = VIEW_META[category];
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-1 font-mono text-mini font-bold text-muted-foreground/60">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-[-0.035em]">{meta.label}</h2>
          <p className="mt-0.5 text-petite text-muted-foreground">{meta.description}</p>
        </div>
      </div>
      {preview && (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-petite font-bold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          {count > 1 ? `All ${count}` : "Open"}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function Dashboard() {
  const { data, loading, error, refresh } = useDashboardData();
  const [view, setView] = useState<DashboardView>("house");
  const health = getDashboardHealth(data);
  const viewMeta = VIEW_META[view];
  const layout: LayoutMode = view === "wall" ? "wall" : "grid";

  const changeView = (next: DashboardView) => {
    startTransition(() => setView(next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const nodeFor = (id: string): React.ReactNode => {
    switch (id) {
      case "alerts-summary": return <AlertsSummaryWidget alerts={data!.alerts} suppressHealthy={health.agentStale} />;
      case "uptime-grid": return <UptimeGridWidget uptime={data!.uptime} uptimeHistory={data!.uptimeHistory} />;
      case "cityscreens": return <CityScreensWidget displays={data!.cityscreens} />;
      case "domains": return <DomainsWidget domains={data!.domains} />;
      case "umami-plaq": return <UmamiWidget site="plaqstudio" title="Plaq Studio" />;
      case "umami-byb": return <UmamiWidget site="bookyourbox" title="BookYourBox" />;
      case "servers": return <ServersWidget servers={data!.servers} />;
      case "backups": return <BackupsWidget backups={data!.backups} />;
      case "integrations": return <IntegrationsWidget integrations={data!.integrations} />;
      case "crons": return <CronsWidget crons={data!.crons} />;
      case "services": return <ServicesWidget services={data?.services} />;
      case "unbilled": return <UnbilledWidget unbilled={data!.unbilled} />;
      case "bank": return <BankWidget />;
      case "timeentries": return <TimeEntriesWidget entries={data!.timeentries} />;
      case "inbox": return <InboxWidget inboxes={data!.inboxes} />;
      case "mailroom": return <MailroomWidget mailroom={data!.mailroom} />;
      case "whatsapp": return <WhatsAppWidget />;
      case "agents": return <AgentsWidget />;
      case "ai-usage": return <AiUsageWidget aiUsage={data?.aiUsage} />;
      case "file-activity": return <FileActivityWidget layout={layout} />;
      case "projects": return <ProjectsWidget projects={data!.projects} />;
      case "file-explorer": return <FileTreeWidget layout={layout} />;
      case "home-control": return <HomeControlWidget />;
      case "sobriety": return <SobrietyWidget />;
      case "weight": return <WeightWidget />;
      case "btc": return <BtcWidget />;
      default: return null;
    }
  };

  const availableWidgets = DEFAULT_WIDGETS
    .filter((widget) => widget.selfFetch || data)
    .sort((a, b) => a.order - b.order);

  const widgetsFor = (category: WidgetCategory, ids?: string[]) => {
    const allowed = ids ? new Set(ids) : null;
    return availableWidgets.filter((widget) => widget.category === category && (!allowed || allowed.has(widget.id)));
  };

  const renderWidgets = (widgets: WidgetConfig[]) => widgets.map((widget) => (
    <Fragment key={widget.id}>{nodeFor(widget.id)}</Fragment>
  ));

  const renderDomainSection = (
    category: WidgetCategory,
    index: number,
    options: { preview?: boolean; ids?: string[] } = {}
  ) => {
    const widgets = widgetsFor(category, options.ids);
    const total = DEFAULT_WIDGETS.filter((widget) => widget.category === category).length;
    if (widgets.length === 0) return null;

    return (
      <section key={category} aria-labelledby={`section-${category}`} className="cockpit-section">
        <div id={`section-${category}`}>
          <SectionHeading
            category={category}
            index={index}
            count={total}
            preview={options.preview ?? false}
            onOpen={() => changeView(category)}
          />
        </div>
        <div className={SECTION_GRID}>{renderWidgets(widgets)}</div>
      </section>
    );
  };

  const attention = (
    <section aria-labelledby="attention-title" className="cockpit-section">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-mini font-bold uppercase tracking-[0.16em] text-muted-foreground">Priority 00</p>
          <h2 id="attention-title" className="mt-1 text-lg font-black tracking-[-0.035em]">Attention queue</h2>
        </div>
        <span className="rounded-full border border-border bg-card px-3 py-1 font-mono text-mini font-bold text-muted-foreground">
          {health.attentionCount} signal{health.attentionCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-3">
        <SourceFreshnessNotice agentStale={health.agentStale} uptimeStale={health.uptimeStale} />
        {data && <AlertsSummaryWidget alerts={data.alerts} suppressHealthy={health.agentStale || health.uptimeStale} />}
        {data && health.attentionCount === 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-600/25 bg-emerald-600/[0.07] px-4 py-3 text-emerald-800 dark:text-emerald-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <p className="text-petite font-bold">No active exceptions. The queue is clear.</p>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      <CockpitRail view={view} onChange={changeView} tone={health.tone} />

      <div className="min-w-0 flex-1">
        <DashboardHeader
          title={viewMeta.label}
          description={viewMeta.description}
          generatedAt={data?.generatedAt ?? null}
          sourceUpdatedAt={data?.freshness.agent ?? null}
          tone={health.tone}
          onRefresh={() => refresh()}
          loading={loading}
        />

        <main className="mx-auto w-full max-w-[1720px] space-y-6 px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
          <MobileCockpitNav view={view} onChange={changeView} />

          {error && (
            <div role="alert" className="rounded-xl border border-red-600/35 bg-red-600/[0.08] px-4 py-3 text-petite text-red-800 dark:text-red-200">
              <span className="font-bold">Dashboard request failed.</span> {error}
            </div>
          )}

          {loading && !data ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Loading dashboard">
              <div className="h-64 animate-pulse rounded-2xl bg-muted md:col-span-2 xl:col-span-2" />
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-48 animate-pulse rounded-2xl bg-muted xl:col-span-1" />
              ))}
            </div>
          ) : (
            <div key={view} className="cockpit-view space-y-6">
              {view === "wall" && <CockpitSummary data={data} />}

              {view === "alerts" && attention}

              {view === "house" && <HouseConsole />}

              {view !== "wall" && view !== "alerts" && view !== "house" && renderDomainSection(view, 0)}

              {view === "wall" && (
                <>
                  {attention}
                  <section aria-labelledby="wallboard-title" className="cockpit-section">
                    <div className="mb-4">
                      <p className="font-mono text-mini font-bold uppercase tracking-[0.16em] text-muted-foreground">Shared display</p>
                      <h2 id="wallboard-title" className="mt-1 text-lg font-black tracking-[-0.035em]">Operational matrix</h2>
                    </div>
                    <div className="[column-gap:0.75rem] [column-width:340px]">
                      {availableWidgets.filter((widget) => WALLBOARD_IDS.has(widget.id)).map((widget) => (
                        <div key={widget.id} className="mb-3 break-inside-avoid">{nodeFor(widget.id)}</div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </main>
      </div>
      <FileModal />
    </div>
  );
}
