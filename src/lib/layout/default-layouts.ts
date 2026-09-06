// Code-owned default placements: the Cockpit exactly as it renders today.
//
// Order is the old registry `order` sort per domain. Widths are the spans the
// widgets' own WidgetTile calls produce right now, not what the registry
// claimed: `sm` and `md` were both a third of the row, so both are
// `standard` here; `lg` is `wide`; `xl` is `full`. Change a placement here
// and the view changes; the catalog's defaultWidth is only the fallback.

import { MODULE_BY_ID } from "./catalog";
import { TILE_SIZES, packRects } from "./grid";
import type { ModulePlacement, SurfaceId, TileRect } from "./types";

export const DEFAULT_LAYOUTS: Record<SurfaceId, ModulePlacement[]> = {
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

  // The shared display: an operational subset, chosen in code rather than by
  // priority order. The resolver strips private and control modules from it
  // regardless, so this list is a starting point, not the safety boundary.
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

/**
 * Where each tile starts on the canvas plane.
 *
 * Positions are packed from the order above rather than written out by hand:
 * sizes live on the module (catalog `defaultSize`), order is the priority
 * model, and first-fit turns the two into coordinates. Adding a module is
 * therefore one line in the list above, not a coordinate puzzle, and the
 * result is the same on every device that has never been arranged.
 */
export const CANVAS_DEFAULT_RECTS: Record<string, TileRect> = packRects(
  DEFAULT_LAYOUTS.canvas.map((placement) => {
    const size =
      placement.size ?? MODULE_BY_ID[placement.moduleId]?.defaultSize ?? TILE_SIZES.list;
    return { moduleId: placement.moduleId, w: size.w, h: size.h };
  })
);
