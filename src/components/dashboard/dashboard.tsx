"use client";

import { useState, useCallback, useEffect } from "react";
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
import { BtcWidget } from "./widgets/btc-widget";
import { BankWidget } from "./widgets/bank-widget";
import { FileActivityWidget } from "./widgets/file-activity-widget";
import { ServicesWidget } from "./widgets/services-status-widget";
import { AgentsWidget } from "./widgets/agents-widget";
import { FileTreeWidget, FileModal } from "./widgets/file-explorer-widget";
import { HomeControlWidget } from "./widgets/home-control-widget";
import { EnergyWidget } from "./widgets/energy-widget";
import { VentilationWidget } from "./widgets/ventilation-widget";
import { CATEGORY_LABELS, type WidgetCategory } from "@/lib/widget-registry";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES: WidgetCategory[] = ["alerts", "infrastructure", "uptime", "business", "analytics", "projects", "devserver", "files", "health", "home", "energy", "ventilation"];

const CATEGORY_STORAGE_KEY = "cockpit:disabledCategories";
const LAYOUT_STORAGE_KEY = "cockpit:layout";

type LayoutMode = "grid" | "columns";

// Vertical: responsive grid that wraps into rows (good for phones).
const GRID_CLS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2";
// Horizontal: widgets fill a column top-to-bottom then wrap rightward; the
// page scrolls sideways. Fixed viewport height drives the column wrapping.
const COLS_CLS =
  "flex flex-col flex-wrap content-start gap-2 overflow-x-auto h-[calc(100vh-128px)] pb-2 [&>*]:w-[400px] [&>*]:shrink-0 [&>.fa-wide]:w-[820px] [&>.energy-wide]:w-[calc(100vw-2rem)] [&>.ventilation-wide]:w-[calc(100vw-2rem)]";

function LayoutToggle({ layout, onChange }: { layout: LayoutMode; onChange: (m: LayoutMode) => void }) {
  return (
    <div className="flex shrink-0 border-2 border-border">
      {(["grid", "columns"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          title={m === "grid" ? "Vertical (stack & scroll down)" : "Horizontal (columns, scroll right)"}
          className={cn(
            "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
            layout === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "grid" ? "Vertical" : "Horizontal"}
        </button>
      ))}
    </div>
  );
}

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
  const [hydrated, setHydrated] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("grid");

  // Restore which tabs were active. We persist the *disabled* set so any
  // category added in a later release still shows up by default.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
      if (raw) {
        const disabled = new Set(JSON.parse(raw) as string[]);
        setEnabledCategories(new Set(ALL_CATEGORIES.filter((c) => !disabled.has(c))));
      }
      const l = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (l === "columns" || l === "grid") setLayout(l);
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, []);

  // Persist on change (but not before the initial restore has run).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const disabled = ALL_CATEGORIES.filter((c) => !enabledCategories.has(c));
      localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(disabled));
      localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
    } catch {
      /* storage unavailable */
    }
  }, [enabledCategories, layout, hydrated]);

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

      <main className={cn("p-2 space-y-2 mx-auto", layout === "columns" ? "max-w-none" : "max-w-[1800px]")}>
        <div className="flex items-start justify-between gap-2">
          <CategoryFilter enabled={enabledCategories} onToggle={toggleCategory} />
          <LayoutToggle layout={layout} onChange={setLayout} />
        </div>

        <div className={layout === "columns" ? COLS_CLS : GRID_CLS}>
          {/* File Activity — first / focus widget */}
          {show("devserver") && data && <FileActivityWidget layout={layout} />}

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
              <BankWidget />
              <BtcWidget />
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

          {/* Dev Server (File Activity is rendered first above) */}
          {show("devserver") && data && <ServicesWidget services={data.services} />}
          {show("devserver") && <AgentsWidget />}

          {/* Files — lightweight tree; clicking a file opens the full explorer modal */}
          {show("files") && <FileTreeWidget layout={layout} />}

          {/* Health */}
          {show("health") && (
            <>
              <SobrietyWidget />
              <WeightWidget />
            </>
          )}

          {/* Home — office lights + scenes (interactive) */}
          {show("home") && <HomeControlWidget />}

          {/* Energy — live grid / solar / battery view with graphs */}
          {show("energy") && <EnergyWidget />}

          {/* Ventilation — Ubbink Vigor MVHR: temps, airflow, filter + fan control */}
          {show("ventilation") && <VentilationWidget />}
        </div>

        {loading && !data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-card border-2 border-border animate-pulse col-span-1 lg:col-span-2" />
            ))}
          </div>
        )}
      </main>
      <FileModal />
    </div>
  );
}
