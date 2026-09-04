// Code-owned default placements: the Cockpit exactly as it renders today.
//
// Order is the old registry `order` sort per domain. Widths are the spans the
// widgets' own WidgetTile calls produce right now, not what the registry
// claimed: `sm` and `md` were both a third of the row, so both are
// `standard` here; `lg` is `wide`; `xl` is `full`. Change a placement here
// and the view changes; the catalog's defaultWidth is only the fallback.

import { BOTTOM_BAR_IDS, VIEWS } from "@/lib/views";
import type { ModulePlacement, ViewId } from "./types";

export const DEFAULT_LAYOUTS: Record<ViewId, ModulePlacement[]> = {
  house: [{ moduleId: "home-control" }],

  alerts: [{ moduleId: "alerts-summary" }],

  infra: [
    { moduleId: "infra.summary" },
    { moduleId: "servers" },
    { moduleId: "gpu" },
    { moduleId: "backups" },
    { moduleId: "connections" },
    { moduleId: "crons", width: "standard" },
    { moduleId: "services" },
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
