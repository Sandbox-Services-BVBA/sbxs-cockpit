// Single source of truth for the dashboard. `dashboard.tsx` maps over
// DEFAULT_WIDGETS (filtered by enabled category, sorted by `order`) instead of
// hard-coding render blocks, so ordering / categorisation lives here.

export type LayoutMode = "grid" | "columns" | "wall";

export type WidgetCategory =
  | "alerts"
  | "sites"
  | "money"
  | "infra"
  | "dev"
  | "comms"
  | "house"
  | "personal";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

export interface WidgetConfig {
  id: string;
  title: string;
  category: WidgetCategory;
  size: WidgetSize;
  order: number;
  /** Widget fetches its own data; renders before the shared /api/dashboard payload arrives. */
  selfFetch?: boolean;
}

// Filter-bar order: ops-critical first, personal last.
export const ALL_CATEGORIES: WidgetCategory[] = [
  "alerts",
  "sites",
  "money",
  "infra",
  "comms",
  "dev",
  "house",
  "personal",
];

// What shows on the always-on ops wall by default. Dev/House/Personal are
// one-tap views, off by default so the wall stays a clean ops overview.
export const DEFAULT_ENABLED_CATEGORIES: WidgetCategory[] = [
  "alerts",
  "sites",
  "money",
  "infra",
  "comms",
];

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  alerts: "Alerts",
  sites: "Client Sites",
  money: "Money",
  infra: "Infrastructure",
  comms: "Comms",
  dev: "Dev",
  house: "House",
  personal: "Personal",
};

export const CATEGORY_COLORS: Record<WidgetCategory, string> = {
  alerts: "#ef4444",
  sites: "#10b981",
  money: "#f59e0b",
  infra: "#517FA4",
  comms: "#14b8a6",
  dev: "#8b5cf6",
  house: "#a855f7",
  personal: "#ec4899",
};

// Size maps to CSS grid column spans (only used in the "grid" / vertical layout).
export const SIZE_SPANS: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-1 lg:col-span-2",
  lg: "col-span-1 sm:col-span-2 lg:col-span-3 3xl:col-span-4",
  xl: "col-span-1 sm:col-span-2 lg:col-span-4 xl:col-span-6 3xl:col-span-8 4xl:col-span-12",
};

// All 26 widgets, ordered by importance for an always-on ops wall.
export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "alerts-summary", title: "Active Alerts", category: "alerts", size: "xl", order: 1 },

  // Client sites — SLA / traffic
  { id: "uptime-grid", title: "Uptime Monitor", category: "sites", size: "lg", order: 2 },
  { id: "cityscreens", title: "CityScreens", category: "sites", size: "sm", order: 8 },
  { id: "domains", title: "Domain Renewals", category: "sites", size: "sm", order: 9 },
  { id: "umami-plaq", title: "Plaq Studio", category: "sites", size: "sm", order: 12, selfFetch: true },
  { id: "umami-byb", title: "BookYourBox", category: "sites", size: "sm", order: 13, selfFetch: true },

  // Infrastructure — plumbing health
  { id: "servers", title: "Servers", category: "infra", size: "lg", order: 3 },
  { id: "backups", title: "Backups", category: "infra", size: "md", order: 4 },
  { id: "integrations", title: "Integrations", category: "infra", size: "md", order: 5 },
  { id: "crons", title: "Cron Jobs", category: "infra", size: "sm", order: 10 },
  { id: "services", title: "Services", category: "infra", size: "md", order: 11, selfFetch: true },

  // Money — finance / billing
  { id: "unbilled", title: "Unbilled", category: "money", size: "md", order: 6 },
  { id: "bank", title: "Bank", category: "money", size: "md", order: 7, selfFetch: true },
  { id: "timeentries", title: "Recent Toggl", category: "money", size: "sm", order: 16 },

  // Comms — email volume / triage
  { id: "inbox", title: "Inboxes", category: "comms", size: "sm", order: 14 },
  { id: "mailroom", title: "Mailroom", category: "comms", size: "sm", order: 15 },

  // Dev activity — off by default on the wall
  { id: "agents", title: "Agents", category: "dev", size: "md", order: 17, selfFetch: true },
  { id: "file-activity", title: "File Activity", category: "dev", size: "lg", order: 18, selfFetch: true },
  { id: "projects", title: "Recent Projects", category: "dev", size: "sm", order: 19 },
  { id: "file-explorer", title: "Files", category: "dev", size: "sm", order: 20, selfFetch: true },

  // House — energy / ventilation / lights
  { id: "energy", title: "Energie", category: "house", size: "xl", order: 21, selfFetch: true },
  { id: "ventilation", title: "Ventilatie", category: "house", size: "xl", order: 22, selfFetch: true },
  { id: "home-control", title: "Office", category: "house", size: "md", order: 23, selfFetch: true },

  // Personal — off by default
  { id: "sobriety", title: "Sobriety", category: "personal", size: "sm", order: 24, selfFetch: true },
  { id: "weight", title: "Weight", category: "personal", size: "md", order: 25, selfFetch: true },
  { id: "btc", title: "Bitcoin", category: "personal", size: "md", order: 26, selfFetch: true },
];
