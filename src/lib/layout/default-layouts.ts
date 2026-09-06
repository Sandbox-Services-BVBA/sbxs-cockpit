// Code-owned default placements: the Cockpit exactly as it renders today.
//
// Order is the old registry `order` sort per domain. Widths are the spans the
// widgets' own WidgetTile calls produce right now, not what the registry
// claimed: `sm` and `md` were both a third of the row, so both are
// `standard` here; `lg` is `wide`; `xl` is `full`. Change a placement here
// and the view changes; the catalog's defaultWidth is only the fallback.

import { BOTTOM_BAR_IDS, VIEWS } from "@/lib/views";
import type { ModulePlacement, ViewId } from "./types";
import { HOME_LAYOUT } from "./home-modules";

export const DEFAULT_LAYOUTS: Record<ViewId, ModulePlacement[]> = {
  // The canvas is the whole app: one flat page holding every module, arranged
  // by dragging rather than by navigating. The starting order is the priority
  // model in COCKPIT-PRIORITIES.md, exceptions first and private signals last,
  // but nothing here is structural. The moment Bob drags a tile this order is
  // only the fallback for a module his profile has never seen.
  canvas: [
    // P0 - what is wrong right now.
    { moduleId: "alerts-summary" },
    { moduleId: "infra.summary" },

    // The house, because it is the view he lives in.
    { moduleId: "home.house" },

    // P1 - daily work.
    { moduleId: "unbilled" },
    { moduleId: "bank" },
    { moduleId: "inbox" },
    { moduleId: "mailroom" },
    { moduleId: "agents" },
    { moduleId: "home-control" },
    { moduleId: "home.ventilation" },
    { moduleId: "home.airco" },
    { moduleId: "home.batteries" },

    // P2 - awareness.
    { moduleId: "home.energy" },
    { moduleId: "home.climate" },
    { moduleId: "home.gas" },
    { moduleId: "home.water" },
    { moduleId: "servers" },
    { moduleId: "gpu" },
    { moduleId: "thermals" },
    { moduleId: "services" },
    { moduleId: "backups" },
    { moduleId: "crons" },
    { moduleId: "connections" },
    { moduleId: "uptime-grid" },
    { moduleId: "domains" },
    { moduleId: "cityscreens" },
    { moduleId: "umami-plaq" },
    { moduleId: "umami-byb" },
    { moduleId: "whatsapp" },
    { moduleId: "timeentries" },
    { moduleId: "projects" },
    { moduleId: "ai-usage" },

    // P3 - detail and private, last because they are the least urgent.
    { moduleId: "file-activity" },
    { moduleId: "file-explorer" },
    { moduleId: "home.raw-metrics" },
    { moduleId: "weight" },
    { moduleId: "btc" },
  ],

  // HOME_LAYOUT places Office itself, in its live-mode slot after Airco.
  house: HOME_LAYOUT,

  alerts: [{ moduleId: "alerts-summary" }],

  // Infrastructure as it looked with its hand-built grid: the rollup strip,
  // then Servers, GPU and Connections across the whole row, with the three
  // list panes sharing one row between them. The old grid stacked Backups
  // under Scheduled jobs beside Services; a flat grid cannot nest, so the
  // three sit side by side instead and each is as tall as its own list.
  infra: [
    { moduleId: "infra.summary" },
    { moduleId: "servers", width: "full" },
    { moduleId: "gpu", width: "full" },
    { moduleId: "thermals", width: "full" },
    { moduleId: "services", width: "standard" },
    { moduleId: "backups", width: "standard" },
    { moduleId: "crons", width: "standard" },
    { moduleId: "connections", width: "full" },
  ],

  sites: [
    { moduleId: "uptime-grid" },
    { moduleId: "cityscreens", width: "standard" },
    { moduleId: "domains", width: "standard" },
    { moduleId: "umami-plaq", width: "standard" },
    { moduleId: "umami-byb", width: "standard" },
  ],

  money: [
    { moduleId: "unbilled" },
    { moduleId: "bank" },
    { moduleId: "timeentries", width: "standard" },
  ],

  comms: [
    { moduleId: "inbox", width: "standard" },
    { moduleId: "mailroom", width: "standard" },
    { moduleId: "whatsapp" },
  ],

  dev: [
    { moduleId: "agents" },
    { moduleId: "file-activity" },
    { moduleId: "projects", width: "standard" },
    { moduleId: "ai-usage", width: "standard" },
    { moduleId: "file-explorer" },
  ],

  personal: [{ moduleId: "weight" }, { moduleId: "btc" }],

  // The wall's operational matrix, in the same registry order WallView uses.
  // The attention queue above it is chrome, not a placement.
  wall: [
    { moduleId: "uptime-grid" },
    { moduleId: "servers" },
    { moduleId: "gpu" },
    { moduleId: "thermals" },
    { moduleId: "backups" },
    { moduleId: "connections" },
    { moduleId: "cityscreens", width: "standard" },
    { moduleId: "domains", width: "standard" },
    { moduleId: "crons", width: "standard" },
    { moduleId: "services" },
    { moduleId: "inbox", width: "standard" },
    { moduleId: "mailroom", width: "standard" },
  ],
};

export const DEFAULT_DOMAIN_ORDER: ViewId[] = VIEWS.map((view) => view.id);

export const DEFAULT_MOBILE_PINS: ViewId[] = [...BOTTOM_BAR_IDS];
