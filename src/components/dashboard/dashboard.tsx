"use client";

import { useState, useCallback } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { DashboardHeader } from "./header";
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
import { UnbilledWidget } from "./widgets/unbilled-widget";
import { TimeEntriesWidget } from "./widgets/timeentries-widget";
import { CATEGORY_LABELS, type WidgetCategory } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES: WidgetCategory[] = ["alerts", "infrastructure", "uptime", "business", "analytics", "projects", "health"];

function CategoryFilter({
  enabled,
  onToggle,
}: {
  enabled: Set<WidgetCategory>;
  onToggle: (cat: WidgetCategory) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ALL_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onToggle(cat)}
          className={cn(
            "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border-2 transition-colors",
            enabled.has(cat)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground border-border hover:border-muted-foreground"
          )}
        >
          {CATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { data, loading, error, refresh } = useDashboardData();
  const [enabledCategories, setEnabledCategories] = useState<Set<WidgetCategory>>(
    new Set(ALL_CATEGORIES)
  );

  const toggleCategory = useCallback((cat: WidgetCategory) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const show = (cat: WidgetCategory) => enabledCategories.has(cat);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        lastUpdated={data?.lastUpdated || null}
        onRefresh={() => refresh()}
        loading={loading}
      />

      {error && (
        <div className="mx-2 mt-2 border-2 border-[#ff4444] bg-[#ff4444]/10 px-2 py-1.5 text-[11px]">
          Failed to load: {error}
        </div>
      )}

      <main className="p-2 space-y-2 max-w-[1800px] mx-auto">
        <CategoryFilter enabled={enabledCategories} onToggle={toggleCategory} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {/* Alerts */}
          {show("alerts") && data && (
            <AlertsSummaryWidget alerts={data.alerts} />
          )}

          {/* Infrastructure */}
          {show("infrastructure") && data && (
            <>
              <ServersWidget servers={data.servers} />
              <BackupsWidget backups={data.backups} />
              <CronsWidget crons={data.crons} />
              <DomainsWidget domains={data.domains} />
            </>
          )}

          {/* Uptime */}
          {show("uptime") && data && (
            <>
              <UptimeGridWidget uptime={data.uptime} uptimeHistory={data.uptimeHistory} />
              <CityScreensWidget displays={data.cityscreens} />
            </>
          )}

          {/* Business */}
          {show("business") && data && (
            <>
              <UnbilledWidget unbilled={data.unbilled} />
              <TimeEntriesWidget entries={data.timeentries} />
              <InboxWidget inboxes={data.inboxes} />
              <MailroomWidget mailroom={data.mailroom} />
            </>
          )}

          {/* Analytics */}
          {show("analytics") && (
            <>
              <UmamiWidget site="plaqstudio" title="Plaq Studio" />
              <UmamiWidget site="bookyourbox" title="BookYourBox" />
            </>
          )}

          {/* Projects */}
          {show("projects") && data && (
            <>
              <ProjectsWidget projects={data.projects} />
              <IntegrationsWidget integrations={data.integrations} />
            </>
          )}

          {/* Health */}
          {show("health") && (
            <>
              <SobrietyWidget />
              <WeightWidget />
            </>
          )}
        </div>

        {loading && !data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-card border-2 border-border animate-pulse col-span-1 lg:col-span-2" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
