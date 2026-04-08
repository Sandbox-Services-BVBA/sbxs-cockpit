export type WidgetCategory =
  | "infrastructure"
  | "uptime"
  | "projects"
  | "analytics"
  | "health"
  | "alerts";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

export interface WidgetConfig {
  id: string;
  title: string;
  category: WidgetCategory;
  size: WidgetSize;
  component: string;
  refreshInterval?: number; // ms, for SWR
}

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  infrastructure: "Infrastructure",
  uptime: "Uptime",
  projects: "Projects",
  analytics: "Analytics",
  health: "Health",
  alerts: "Alerts",
};

export const CATEGORY_COLORS: Record<WidgetCategory, string> = {
  infrastructure: "#517FA4",
  uptime: "#10b981",
  projects: "#8b5cf6",
  analytics: "#f59e0b",
  health: "#ec4899",
  alerts: "#ef4444",
};

// Size maps to CSS grid column spans
export const SIZE_SPANS: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-1 lg:col-span-2",
  lg: "col-span-1 lg:col-span-2 xl:col-span-3",
  xl: "col-span-1 lg:col-span-2 xl:col-span-4",
};

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  // Alerts - always first
  { id: "alerts-summary", title: "Active Alerts", category: "alerts", size: "xl", component: "AlertsSummaryWidget" },

  // Infrastructure
  { id: "servers", title: "Servers", category: "infrastructure", size: "lg", component: "ServersWidget", refreshInterval: 300000 },
  { id: "backups", title: "Backups", category: "infrastructure", size: "md", component: "BackupsWidget", refreshInterval: 300000 },
  { id: "crons", title: "Cron Jobs", category: "infrastructure", size: "md", component: "CronsWidget", refreshInterval: 300000 },

  // Uptime
  { id: "uptime-grid", title: "Uptime Monitor", category: "uptime", size: "lg", component: "UptimeGridWidget", refreshInterval: 300000 },

  // Analytics
  { id: "analytics-plaq", title: "Plaq Studio Visitors", category: "analytics", size: "sm", component: "UmamiWidget", refreshInterval: 900000 },
  { id: "analytics-byb", title: "BookYourBox Visitors", category: "analytics", size: "sm", component: "UmamiWidget", refreshInterval: 900000 },

  // Projects
  { id: "projects-recent", title: "Recent Projects", category: "projects", size: "sm", component: "ProjectsWidget", refreshInterval: 1800000 },
  { id: "integrations", title: "Integrations", category: "projects", size: "md", component: "IntegrationsWidget", refreshInterval: 300000 },

  // Health
  { id: "sobriety-streak", title: "Sobriety Streak", category: "health", size: "sm", component: "SobrietyWidget" },
  { id: "weight-tracker", title: "Weight", category: "health", size: "sm", component: "WeightWidget" },
];
