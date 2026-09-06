// The cockpit is one page. There is no domain navigation any more: every
// module lives on the canvas at `/`, and the only other surface is the
// wallboard, an unattended shared display that is reached by URL, not by a
// menu. This file names those two surfaces plus the drill-down tools that
// keep a route of their own, so the shell can title the page and route back.
//
// The old domain ids (house, alerts, infra, ...) survive as ViewIds because
// the catalog still tags every module with the domain that owns it, and the
// canvas's Add tray groups by that tag. They are labels now, not pages: each
// of their routes redirects to `/`.

export type SurfaceId = "canvas" | "wall";

export type DomainId =
  | "house"
  | "alerts"
  | "sites"
  | "infra"
  | "money"
  | "comms"
  | "dev"
  | "personal";

export type ViewId = SurfaceId | DomainId;

export interface ViewMeta {
  id: ViewId;
  href: string;
  label: string;
  description: string;
}

/** The surfaces that render a module layout. Both are real routes. */
export const VIEWS: ViewMeta[] = [
  {
    id: "canvas",
    href: "/",
    label: "Cockpit",
    description: "Everything at once, arranged the way you left it",
  },
  {
    id: "wall",
    href: "/wall",
    label: "Wallboard",
    description: "A calm, non-sensitive operations display",
  },
];

/** What the catalog's owner tags mean to a human, for grouping in the tray. */
export const DOMAIN_LABELS: Record<DomainId, string> = {
  house: "Home",
  alerts: "Attention",
  infra: "Infrastructure",
  sites: "Client sites",
  money: "Finance",
  comms: "Communications",
  dev: "Development",
  personal: "Personal",
};

// Owner tags get a meta entry too so anything indexed by ViewId keeps
// resolving; their href is the canvas, which is where their route lands.
export const VIEW_BY_ID = {
  ...Object.fromEntries(VIEWS.map((view) => [view.id, view])),
  ...Object.fromEntries(
    (Object.keys(DOMAIN_LABELS) as DomainId[]).map((id) => [
      id,
      { id, href: "/", label: DOMAIN_LABELS[id], description: DOMAIN_LABELS[id] },
    ])
  ),
} as Record<ViewId, ViewMeta>;

/** Read-only tools that keep their own route because they are consoles, not tiles. */
export interface DrillDown {
  href: string;
  label: string;
}

export const DRILL_DOWNS: DrillDown[] = [
  { href: "/infra/logs", label: "Service logs" },
  { href: "/comms/mailroom", label: "Mailroom trail" },
];

export interface PageMeta {
  /** The surface whose layout applies. Drill-downs belong to the canvas. */
  view: ViewMeta;
  title: string;
  /** True on a drill-down route, where the header offers a way back to `/`. */
  drillDown: boolean;
}

export function pageForPath(pathname: string): PageMeta {
  const wall = VIEWS[1];
  if (pathname === wall.href || pathname.startsWith(`${wall.href}/`)) {
    return { view: wall, title: wall.label, drillDown: false };
  }
  const tool = DRILL_DOWNS.find((entry) => pathname === entry.href);
  const canvas = VIEWS[0];
  if (tool) return { view: canvas, title: tool.label, drillDown: true };
  return { view: canvas, title: canvas.label, drillDown: false };
}
