"use client";

import type { ReactNode } from "react";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import type { ModuleDensity } from "@/lib/layout/types";
import type { LayoutMode } from "@/lib/widget-registry";
import { AlertsSummaryWidget } from "../widgets/alerts-summary-widget";
import { ServersWidget } from "../widgets/servers-widget";
import { BackupsWidget } from "../widgets/backups-widget";
import { CronsWidget } from "../widgets/crons-widget";
import { UptimeGridWidget } from "../widgets/uptime-grid-widget";
import { ProjectsWidget } from "../widgets/projects-widget";
import { ConnectionsWidget } from "../widgets/connections-widget";
import { UmamiWidget } from "../widgets/umami-widget";
import { WeightWidget } from "../widgets/weight-widget";
import { DomainsWidget } from "../widgets/domains-widget";
import { InboxWidget } from "../widgets/inbox-widget";
import { CityScreensWidget } from "../widgets/cityscreens-widget";
import { MailroomWidget } from "../widgets/mailroom-widget";
import { WhatsAppWidget } from "../widgets/whatsapp-widget";
import { UnbilledWidget } from "../widgets/unbilled-widget";
import { TimeEntriesWidget } from "../widgets/timeentries-widget";
import { BtcWidget } from "../widgets/btc-widget";
import { BankWidget } from "../widgets/bank-widget";
import { FileActivityWidget } from "../widgets/file-activity-widget";
import { ServicesWidget } from "../widgets/services-status-widget";
import { AgentsWidget } from "../widgets/agents-widget";
import { AiUsageWidget } from "../widgets/ai-usage-widget";
import { FileTreeWidget } from "../widgets/file-explorer-widget";
import { HomeControlWidget } from "../widgets/home-control-widget";
import { GpuWidget } from "../widgets/gpu-widget";
import { InfraSummary } from "../infra/infra-summary";
import { ServersPane } from "../infra/servers-pane";
import { BackupsPane } from "../infra/backups-pane";
import { ConnectionsPane } from "../infra/connections-pane";
import { CronsPane } from "../infra/crons-pane";
import { ServicesPane } from "../infra/services-pane";

export interface ModuleRenderContext {
  data: DashboardData | null;
  agentStale: boolean;
  /**
   * The resolved density. The list modules (Infrastructure panes, the alert
   * queue) read it; the rest are fixed-density in the catalog and never see
   * anything but "standard".
   */
  density: ModuleDensity;
  layout: LayoutMode;
}

/**
 * Catalog id to component. Shared-data modules are only asked for once
 * `data` is present, so the non-null assertions are the caller's contract.
 * Unknown ids return null and the caller skips the frame.
 *
 * The Infrastructure modules have two faces: the converted panes on their
 * own domain, and the older WidgetTile cards the wall still speaks. The
 * layout mode picks, so the wall keeps its look when it migrates here.
 */
export function moduleNode(id: string, { data, agentStale, density, layout }: ModuleRenderContext): ReactNode {
  const wall = layout === "wall";
  switch (id) {
    case "infra.summary": return <InfraSummary data={data!} />;
    case "servers": return wall
      ? <ServersWidget servers={data!.servers} density={density} />
      : <ServersPane servers={data!.servers} density={density} />;
    case "gpu": return <GpuWidget gpu={data!.gpu} history={data!.gpuHistory} />;
    case "backups": return wall
      ? <BackupsWidget backups={data!.backups} density={density} />
      : <BackupsPane backups={data!.backups} density={density} />;
    case "connections": return wall
      ? <ConnectionsWidget connections={data!.integrations} density={density} />
      : <ConnectionsPane connections={data!.integrations} density={density} />;
    case "crons": return wall
      ? <CronsWidget crons={data!.crons} density={density} />
      : <CronsPane crons={data!.crons} density={density} />;
    case "services": return wall
      ? <ServicesWidget services={data?.services} density={density} />
      : <ServicesPane services={data?.services} density={density} />;
    case "alerts-summary": return <AlertsSummaryWidget alerts={data!.alerts} density={density} suppressHealthy={agentStale} />;
    case "uptime-grid": return <UptimeGridWidget uptime={data!.uptime} uptimeHistory={data!.uptimeHistory} />;
    case "cityscreens": return <CityScreensWidget displays={data!.cityscreens} />;
    case "domains": return <DomainsWidget domains={data!.domains} />;
    case "umami-plaq": return <UmamiWidget site="plaqstudio" title="Plaq Studio" />;
    case "umami-byb": return <UmamiWidget site="bookyourbox" title="BookYourBox" />;
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
    case "weight": return <WeightWidget />;
    case "btc": return <BtcWidget />;
    default: return null;
  }
}
