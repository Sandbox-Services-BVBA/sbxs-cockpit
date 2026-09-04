// The one responsive grid every resolved view renders into.
//
// Twelve columns on wide desktop, six on tablet, one on the phone. DOM order
// is canonical at every width and there is deliberately no auto-flow dense:
// a visually reordered grid disagrees with keyboard and screen-reader order.
// Tailwind v4 finds classes by scanning source, so every string below is
// written out in full; never assemble one by interpolation.

import type { ModuleWidth } from "./types";

export const GRID_CLASS = "grid grid-cols-1 items-start gap-3 md:grid-cols-6 xl:grid-cols-12";

/**
 * Semantic width to span. `wide` is two thirds of the desktop row rather than
 * the half the master plan sketched, because that is what the existing `lg`
 * panes (Uptime Monitor, File Activity) occupy today and Phase 1 must not
 * move a pixel. Two thirds also pairs with one `standard` to fill a row.
 */
export const WIDTH_SPANS: Record<ModuleWidth, string> = {
  compact: "col-span-1 md:col-span-3 xl:col-span-3",
  standard: "col-span-1 md:col-span-3 xl:col-span-4",
  wide: "col-span-1 md:col-span-6 xl:col-span-8",
  full: "col-span-1 md:col-span-6 xl:col-span-12",
};
