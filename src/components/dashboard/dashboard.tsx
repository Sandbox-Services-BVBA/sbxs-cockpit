"use client";

import { Fragment, useState, useCallback, useEffect } from "react";
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
import {
  ALL_CATEGORIES,
  DEFAULT_ENABLED_CATEGORIES,
  DEFAULT_WIDGETS,
  CATEGORY_LABELS,
  type LayoutMode,
  type WidgetCategory,
} from "@/lib/widget-registry";
import { cn } from "@/lib/utils";

const CATEGORY_STORAGE_KEY = "cockpit:disabledCategories";
const LAYOUT_STORAGE_KEY = "cockpit:layout";

// Energy/Ventilation are full-width charts; on the wall they get their own
// 2-up band instead of joining the masonry flow.
const BAND_IDS = new Set(["energy", "ventilation"]);

// Vertical: responsive grid that wraps into rows (good for phones). items-start
// + auto column count up to a wall-display tier keeps tiles packed without the
// equal-row-height empty bands.
const GRID_CLS =
  "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-12 gap-2 items-start";
// Horizontal: widgets fill a column top-to-bottom then wrap rightward; the page
// scrolls sideways. Fixed viewport height drives the column wrapping.
const COLS_CLS =
  "flex flex-col flex-wrap content-start gap-2 overflow-x-auto h-[calc(100vh-128px)] pb-2 [&>*]:w-[400px] [&>*]:shrink-0 [&>.energy-wide]:w-[820px] [&>.ventilation-wide]:w-[820px]";
// Wall: width-driven CSS-columns masonry. Column WIDTH (not count) drives how
// many columns appear, so the layout scales continuously to any display with no
// breakpoint cap and no empty rows. Tiles never split across columns.
const WALL_CLS = "[column-width:340px] [column-gap:0.5rem]";

function LayoutToggle({ layout, onChange }: { layout: LayoutMode; onChange: (m: LayoutMode) => void }) {
  const labels: Record<LayoutMode, string> = { grid: "Vertical", columns: "Horizontal", wall: "Wall" };
  const titles: Record<LayoutMode, string> = {
    grid: "Vertical (stack & scroll down)",
    columns: "Horizontal (columns, scroll right)",
    wall: "Wall (dense masonry for always-on display)",
  };
  return (
    <div className="flex shrink-0 border-2 border-border">
      {(["grid", "columns", "wall"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          title={titles[m]}
          className={cn(
            "px-2 py-0.5 text-mini font-bold uppercase tracking-wide transition-colors",
            layout === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {labels[m]}
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
            "px-2 py-0.5 text-mini font-bold uppercase tracking-wide border-2 transition-colors",
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
    new Set(DEFAULT_ENABLED_CATEGORIES)
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
      if (l === "columns" || l === "grid" || l === "wall") setLayout(l);
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
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Render a single widget by id. Data-driven widgets are only invoked once
  // `data` is present (see the visible-list filter below), so the non-null
  // assertions are safe.
  const nodeFor = (id: string): React.ReactNode => {
    switch (id) {
      case "alerts-summary": return <AlertsSummaryWidget alerts={data!.alerts} />;
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
      case "agents": return <AgentsWidget />;
      case "file-activity": return <FileActivityWidget layout={layout} />;
      case "projects": return <ProjectsWidget projects={data!.projects} />;
      case "file-explorer": return <FileTreeWidget layout={layout} />;
      case "energy": return <EnergyWidget layout={layout} />;
      case "ventilation": return <VentilationWidget layout={layout} />;
      case "home-control": return <HomeControlWidget />;
      case "sobriety": return <SobrietyWidget />;
      case "weight": return <WeightWidget />;
      case "btc": return <BtcWidget />;
      default: return null;
    }
  };

  // Widgets to render: enabled category + (self-fetching OR shared data loaded),
  // ordered by importance.
  const visible = DEFAULT_WIDGETS
    .filter((w) => enabledCategories.has(w.category) && (w.selfFetch || data))
    .sort((a, b) => a.order - b.order);

  const alertsWidgets = visible.filter((w) => w.category === "alerts");
  const bandWidgets = visible.filter((w) => BAND_IDS.has(w.id));
  const mainWidgets = visible.filter((w) => w.category !== "alerts" && !BAND_IDS.has(w.id));

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        lastUpdated={data?.lastUpdated || null}
        onRefresh={() => refresh()}
        loading={loading}
      />

      {error && (
        <div className="mx-2 mt-2 border-2 border-[#ff4444] bg-[#ff4444]/10 px-2 py-1.5 text-petite">
          Failed to load: {error}
        </div>
      )}

      <main className={cn("p-2 space-y-2 mx-auto", layout === "grid" ? "max-w-[2400px]" : "max-w-none")}>
        <div className="flex items-start justify-between gap-2">
          <CategoryFilter enabled={enabledCategories} onToggle={toggleCategory} />
          <LayoutToggle layout={layout} onChange={setLayout} />
        </div>

        {layout === "wall" ? (
          <div className="space-y-2">
            {alertsWidgets.map((w) => (
              <Fragment key={w.id}>{nodeFor(w.id)}</Fragment>
            ))}
            <div className={WALL_CLS}>
              {mainWidgets.map((w) => (
                <div key={w.id} className="break-inside-avoid mb-2">
                  {nodeFor(w.id)}
                </div>
              ))}
            </div>
            {bandWidgets.length > 0 && (
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2 items-start">
                {bandWidgets.map((w) => (
                  <Fragment key={w.id}>{nodeFor(w.id)}</Fragment>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={layout === "columns" ? COLS_CLS : GRID_CLS}>
            {visible.map((w) => (
              <Fragment key={w.id}>{nodeFor(w.id)}</Fragment>
            ))}
          </div>
        )}

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
