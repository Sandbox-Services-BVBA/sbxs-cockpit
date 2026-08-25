// Which widgets exist, which domain owns each one, and in what order they
// render. The domain views map over DEFAULT_WIDGETS (filtered by category,
// sorted by `order`) rather than hard-coding render blocks.
//
// Domain labels, descriptions and routes live in lib/views.ts, not here.

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

// Size maps to CSS grid column spans (only used in the "grid" / vertical layout).
export const SIZE_SPANS: Record<WidgetSize, string> = {
  sm: "col-span-1 md:col-span-1 xl:col-span-2",
  md: "col-span-1 md:col-span-1 xl:col-span-2",
  lg: "col-span-1 md:col-span-2 xl:col-span-4",
  xl: "col-span-1 md:col-span-2 xl:col-span-6",
};

// Every widget, ordered by importance for an always-on ops wall.
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
  { id: "connections", title: "Connections", category: "infra", size: "md", order: 5 },
  { id: "crons", title: "Cron Jobs", category: "infra", size: "sm", order: 10 },
  { id: "services", title: "Services", category: "infra", size: "md", order: 11, selfFetch: true },

  // Money — finance / billing
  { id: "unbilled", title: "Unbilled", category: "money", size: "md", order: 6 },
  { id: "bank", title: "Bank", category: "money", size: "md", order: 7, selfFetch: true },
  { id: "timeentries", title: "Recent Toggl", category: "money", size: "sm", order: 16 },

  // Comms — email volume / triage, plus followed WhatsApp conversations
  { id: "inbox", title: "Inboxes", category: "comms", size: "sm", order: 14 },
  { id: "mailroom", title: "Mailroom", category: "comms", size: "sm", order: 15 },
  { id: "whatsapp", title: "WhatsApp", category: "comms", size: "md", order: 15.5, selfFetch: true },

  // Dev activity — off by default on the wall
  { id: "agents", title: "Agents", category: "dev", size: "md", order: 17, selfFetch: true },
  { id: "file-activity", title: "File Activity", category: "dev", size: "lg", order: 18, selfFetch: true },
  { id: "projects", title: "Recent Projects", category: "dev", size: "sm", order: 19 },
  { id: "ai-usage", title: "AI Usage", category: "dev", size: "sm", order: 19.5 },
  { id: "file-explorer", title: "Files", category: "dev", size: "sm", order: 20, selfFetch: true },

  // House — the Home view renders the full console (energy, gas, water,
  // climate, ventilation, office) itself, so only the overview teaser lives here.
  { id: "home-control", title: "Office", category: "house", size: "md", order: 27, selfFetch: true },

  // Personal — off by default. Sobriety was dropped from the dashboard on
  // 2026-08-25; /api/health/sobriety and its table stay, the history is Bob's.
  { id: "weight", title: "Weight", category: "personal", size: "md", order: 25, selfFetch: true },
  { id: "btc", title: "Bitcoin", category: "personal", size: "md", order: 26, selfFetch: true },
];
