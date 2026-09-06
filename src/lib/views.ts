import {
  Activity,
  Code2,
  Globe2,
  HeartPulse,
  House,
  Inbox,
  LayoutGrid,
  Presentation,
  ServerCog,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

// The cockpit's domains, each one a real route. This is the single source of
// truth for navigation: the rail, the bottom bar and every page title read it.
// Order is Bob's priority order — Home first, because it is the view he lives
// in, then the attention queue, then the operational domains.

export type ViewId =
  | "canvas"
  | "house"
  | "alerts"
  | "sites"
  | "infra"
  | "money"
  | "comms"
  | "dev"
  | "personal"
  | "wall";

export interface ViewMeta {
  id: ViewId;
  href: string;
  label: string;
  /** Bottom-bar label: one word, because it sits under a 20px icon. */
  short: string;
  description: string;
  icon: LucideIcon;
}

export const VIEWS: ViewMeta[] = [
  {
    id: "canvas",
    href: "/",
    label: "Cockpit",
    short: "Cockpit",
    description: "Everything at once, arranged the way you left it",
    icon: LayoutGrid,
  },
  {
    id: "house",
    href: "/",
    label: "Home",
    short: "Home",
    description: "Live power, energy, gas, water, climate, ventilation, and office control",
    icon: House,
  },
  {
    id: "alerts",
    href: "/attention",
    label: "Attention",
    short: "Alerts",
    description: "Active incidents, warnings, and stale sources",
    icon: Activity,
  },
  {
    id: "infra",
    href: "/infra",
    label: "Infrastructure",
    short: "Infra",
    description: "Servers, services, backups, connections, and scheduled jobs",
    icon: ServerCog,
  },
  {
    id: "sites",
    href: "/sites",
    label: "Client sites",
    short: "Sites",
    description: "Availability, domains, screens, and traffic",
    icon: Globe2,
  },
  {
    id: "money",
    href: "/money",
    label: "Finance",
    short: "Money",
    description: "Billing, cash position, and recorded time",
    icon: WalletCards,
  },
  {
    id: "comms",
    href: "/comms",
    label: "Communications",
    short: "Comms",
    description: "Inbox load and automated mail processing",
    icon: Inbox,
  },
  {
    id: "dev",
    href: "/dev",
    label: "Development",
    short: "Dev",
    description: "Active agents, projects, files, and activity",
    icon: Code2,
  },
  {
    id: "personal",
    href: "/personal",
    label: "Personal",
    short: "Personal",
    description: "Private health and asset signals",
    icon: HeartPulse,
  },
  {
    id: "wall",
    href: "/wall",
    label: "Wallboard",
    short: "Wall",
    description: "A calm, non-sensitive operations display",
    icon: Presentation,
  },
];

export const VIEW_BY_ID = Object.fromEntries(
  VIEWS.map((view) => [view.id, view])
) as Record<ViewId, ViewMeta>;

/** Views the phone's bottom bar reaches in one tap. The rest live behind More. */
export const BOTTOM_BAR_IDS: ViewId[] = ["house", "alerts", "infra", "sites"];

export function viewForPath(pathname: string): ViewMeta {
  if (pathname === "/") return VIEW_BY_ID.house;
  const match = VIEWS.find(
    (view) => view.href !== "/" && (pathname === view.href || pathname.startsWith(`${view.href}/`))
  );
  return match ?? VIEW_BY_ID.house;
}
