// The module catalog: what exists, who owns it, and what each module may do.
//
// Ids are the same strings the widget registry has always used, so a profile
// saved against the old registry keeps working. Nothing here renders; the
// renderer map lives in components/dashboard/views/module-renderers.tsx and
// the code-owned placements in default-layouts.ts.

import type {
  ModuleDefinition,
  ModuleDensity,
  ModuleSensitivity,
  ModuleWidth,
  ViewId,
} from "./types";
import { HOME_MODULES } from "./home-modules";

const LIST_DENSITIES: ModuleDensity[] = ["summary", "standard", "full"];
const FIXED_DENSITY: ModuleDensity[] = ["standard"];

interface ModuleSpec {
  title: string;
  ownerView: ViewId;
  /** Views beyond the owner the module may be placed in. */
  alsoIn?: ViewId[];
  defaultWidth: ModuleWidth;
  allowedWidths: ModuleWidth[];
  /** Only list-heavy modules get a density choice; the rest are fixed. */
  listy?: boolean;
  sensitivity?: ModuleSensitivity;
  selfFetch?: boolean;
  required?: boolean;
}

function define(id: string, spec: ModuleSpec): ModuleDefinition {
  return {
    id,
    title: spec.title,
    ownerView: spec.ownerView,
    // The canvas is the one page now: every module may live there. The
    // owner view still decides where it appears by default, and the wall
    // keeps its own privacy filter.
    allowedViews: ["canvas", spec.ownerView, ...(spec.alsoIn ?? [])],
    defaultWidth: spec.defaultWidth,
    allowedWidths: spec.allowedWidths,
    defaultDensity: "standard",
    allowedDensities: spec.listy ? LIST_DENSITIES : FIXED_DENSITY,
    sensitivity: spec.sensitivity ?? "normal",
    dataMode: spec.selfFetch ? "self-fetch" : "shared",
    ...(spec.required ? { required: true } : {}),
  };
}

// The wallboard's allow-list. Anything not listed here, plus anything private
// or a write control, never reaches the shared display whatever a profile says.
const WALL: ViewId[] = ["wall"];

const CORE_MODULES: ModuleDefinition[] = [
  // Required and list-heavy: density may fold warnings into a count, never a
  // critical. The widget enforces that; the catalog only offers the choice.
  define("alerts-summary", {
    title: "Active Alerts",
    ownerView: "alerts",
    defaultWidth: "full",
    allowedWidths: ["wide", "full"],
    listy: true,
    required: true,
  }),

  // Client sites
  define("uptime-grid", {
    title: "Uptime Monitor",
    ownerView: "sites",
    alsoIn: WALL,
    defaultWidth: "wide",
    allowedWidths: ["wide", "full"],
    listy: true,
  }),
  define("cityscreens", {
    title: "CityScreens",
    ownerView: "sites",
    alsoIn: WALL,
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard", "wide"],
  }),
  define("domains", {
    title: "Domain Renewals",
    ownerView: "sites",
    alsoIn: WALL,
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard", "wide"],
    listy: true,
  }),
  define("umami-plaq", {
    title: "Plaq Studio",
    ownerView: "sites",
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard"],
    selfFetch: true,
  }),
  define("umami-byb", {
    title: "BookYourBox",
    ownerView: "sites",
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard"],
    selfFetch: true,
  }),

  // Infrastructure. Six placements plus GPU; InfraView renders all of them
  // through the resolver, and the list panes honour density.
  define("infra.summary", {
    title: "Infrastructure rollup",
    ownerView: "infra",
    defaultWidth: "full",
    allowedWidths: ["full"],
  }),
  define("servers", {
    title: "Servers",
    ownerView: "infra",
    alsoIn: WALL,
    defaultWidth: "wide",
    allowedWidths: ["standard", "wide", "full"],
    listy: true,
  }),
  define("gpu", {
    title: "GPU",
    ownerView: "infra",
    alsoIn: WALL,
    defaultWidth: "wide",
    allowedWidths: ["standard", "wide", "full"],
  }),
  define("thermals", {
    title: "Thermals",
    ownerView: "infra",
    alsoIn: WALL,
    defaultWidth: "wide",
    allowedWidths: ["standard", "wide", "full"],
  }),
  define("backups", {
    title: "Backups",
    ownerView: "infra",
    alsoIn: WALL,
    defaultWidth: "standard",
    allowedWidths: ["compact", "standard", "wide"],
    listy: true,
  }),
  define("connections", {
    title: "Connections",
    ownerView: "infra",
    alsoIn: WALL,
    defaultWidth: "standard",
    allowedWidths: ["standard", "wide", "full"],
    listy: true,
  }),
  define("crons", {
    title: "Cron Jobs",
    ownerView: "infra",
    alsoIn: WALL,
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard", "wide", "full"],
    listy: true,
  }),
  define("services", {
    title: "Services",
    ownerView: "infra",
    alsoIn: WALL,
    defaultWidth: "standard",
    allowedWidths: ["standard", "wide", "full"],
    listy: true,
    selfFetch: true,
  }),

  // Finance
  define("unbilled", {
    title: "Unbilled",
    ownerView: "money",
    defaultWidth: "standard",
    allowedWidths: ["compact", "standard", "wide"],
  }),
  define("bank", {
    title: "Bank",
    ownerView: "money",
    defaultWidth: "standard",
    allowedWidths: ["compact", "standard", "wide"],
    sensitivity: "private",
    selfFetch: true,
  }),
  define("timeentries", {
    title: "Recent Toggl",
    ownerView: "money",
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard", "wide"],
  }),

  // Communications
  define("inbox", {
    title: "Inboxes",
    ownerView: "comms",
    alsoIn: WALL,
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard"],
  }),
  define("mailroom", {
    title: "Mailroom",
    ownerView: "comms",
    alsoIn: WALL,
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard", "wide"],
  }),
  define("whatsapp", {
    title: "WhatsApp",
    ownerView: "comms",
    defaultWidth: "standard",
    allowedWidths: ["standard", "wide"],
    selfFetch: true,
  }),

  // Development
  define("agents", {
    title: "Agents",
    ownerView: "dev",
    defaultWidth: "standard",
    allowedWidths: ["standard", "wide", "full"],
    selfFetch: true,
  }),
  define("file-activity", {
    title: "File Activity",
    ownerView: "dev",
    defaultWidth: "wide",
    allowedWidths: ["wide", "full"],
    listy: true,
    sensitivity: "private",
    selfFetch: true,
  }),
  define("projects", {
    title: "Recent Projects",
    ownerView: "dev",
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard", "wide"],
    listy: true,
  }),
  define("ai-usage", {
    title: "AI Usage",
    ownerView: "dev",
    defaultWidth: "compact",
    allowedWidths: ["compact", "standard"],
  }),
  // The registry calls this `sm`, but the tree widget has always forced its
  // own half-width span because a file tree is unreadable any narrower.
  define("file-explorer", {
    title: "Files",
    ownerView: "dev",
    defaultWidth: "wide",
    allowedWidths: ["standard", "wide", "full"],
    sensitivity: "private",
    selfFetch: true,
  }),

  // Home: only the office teaser is a module; the console itself is Phase 5.
  define("home-control", {
    title: "Office",
    ownerView: "house",
    defaultWidth: "standard",
    allowedWidths: ["standard", "wide"],
    sensitivity: "control",
    selfFetch: true,
  }),

  // Personal
  define("weight", {
    title: "Weight",
    ownerView: "personal",
    defaultWidth: "standard",
    allowedWidths: ["compact", "standard", "wide"],
    sensitivity: "private",
    selfFetch: true,
  }),
  define("btc", {
    title: "Bitcoin",
    ownerView: "personal",
    defaultWidth: "standard",
    allowedWidths: ["compact", "standard", "wide"],
    sensitivity: "private",
    selfFetch: true,
  }),
];

// Home's definitions live in their own file: the Home console owns a shared
// timeframe and live feed, so its modules are context modules, not cards.
export const MODULE_CATALOG: ModuleDefinition[] = [...CORE_MODULES, ...HOME_MODULES];

export const MODULE_BY_ID: Record<string, ModuleDefinition> = Object.fromEntries(
  MODULE_CATALOG.map((module) => [module.id, module])
);

export function getModule(id: string): ModuleDefinition | undefined {
  return MODULE_BY_ID[id];
}
