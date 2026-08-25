"use client";

import type { ReactNode } from "react";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import type { LayoutMode } from "@/lib/widget-registry";
import { AlertsSummaryWidget } from "../widgets/alerts-summary-widget";
import { ServersWidget } from "../widgets/servers-widget";
import { BackupsWidget } from "../widgets/backups-widget";
import { CronsWidget } from "../widgets/crons-widget";
import { UptimeGridWidget } from "../widgets/uptime-grid-widget";
import { ProjectsWidget } from "../widgets/projects-widget";
import { ConnectionsWidget } from "../widgets/connections-widget";
import { UmamiWidget } from "../widgets/umami-widget";
import { SobrietyWidget } from "../widgets/sobriety-widget";
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

export interface WidgetContext {
  data: DashboardData | null;
  layout: LayoutMode;
  agentStale: boolean;
}

/**
 * Maps a widget id from the registry to its component. Registry entries
 * without `selfFetch` are only asked for once `data` is present, so the
 * non-null assertions below are the caller's contract, not an assumption.
 */
export function widgetNode(id: string, { data, layout, agentStale }: WidgetContext): ReactNode {
  switch (id) {
    case "alerts-summary": return <AlertsSummaryWidget alerts={data!.alerts} suppressHealthy={agentStale} />;
    case "uptime-grid": return <UptimeGridWidget uptime={data!.uptime} uptimeHistory={data!.uptimeHistory} />;
    case "cityscreens": return <CityScreensWidget displays={data!.cityscreens} />;
    case "domains": return <DomainsWidget domains={data!.domains} />;
    case "umami-plaq": return <UmamiWidget site="plaqstudio" title="Plaq Studio" />;
    case "umami-byb": return <UmamiWidget site="bookyourbox" title="BookYourBox" />;
    case "servers": return <ServersWidget servers={data!.servers} />;
    case "backups": return <BackupsWidget backups={data!.backups} />;
    case "connections": return <ConnectionsWidget connections={data!.integrations} />;
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
}
