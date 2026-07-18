"use client";

import {
  Activity,
  Blocks,
  Code2,
  Command,
  Gauge,
  Globe2,
  HeartPulse,
  House,
  Inbox,
  Presentation,
  ServerCog,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CockpitTone } from "@/lib/dashboard-health";
import type { WidgetCategory } from "@/lib/widget-registry";

export type DashboardView = "wall" | WidgetCategory;

export const VIEW_META: Record<DashboardView, { label: string; description: string }> = {
  alerts: { label: "Attention", description: "Active incidents, warnings, and stale sources" },
  sites: { label: "Client sites", description: "Availability, domains, screens, and traffic" },
  infra: { label: "Infrastructure", description: "Servers, services, backups, and integrations" },
  money: { label: "Finance", description: "Billing, cash position, and recorded time" },
  comms: { label: "Communications", description: "Inbox load and automated mail processing" },
  dev: { label: "Development", description: "Active agents, projects, files, and activity" },
  house: { label: "Home", description: "Live power, energy, gas, water, climate, ventilation, and office control" },
  personal: { label: "Personal", description: "Private health and asset signals" },
  wall: { label: "Wallboard", description: "A calm, non-sensitive operations display" },
};

// Home leads: it is the view Bob actually lives in.
const primaryItems: { id: DashboardView; icon: typeof Gauge }[] = [
  { id: "house", icon: House },
  { id: "alerts", icon: Activity },
  { id: "sites", icon: Globe2 },
  { id: "infra", icon: ServerCog },
  { id: "money", icon: WalletCards },
  { id: "comms", icon: Inbox },
  { id: "dev", icon: Code2 },
  { id: "personal", icon: HeartPulse },
];

const statusClasses: Record<CockpitTone, string> = {
  healthy: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
  unknown: "bg-slate-400",
};

function NavButton({
  id,
  icon: Icon,
  active,
  onChange,
}: {
  id: DashboardView;
  icon: typeof Gauge;
  active: boolean;
  onChange: (view: DashboardView) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-petite font-semibold transition-colors",
        active
          ? "bg-white text-slate-950 shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
          : "text-slate-300 hover:bg-white/8 hover:text-white"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#e5523c]" : "text-slate-400 group-hover:text-white")} aria-hidden="true" />
      <span>{VIEW_META[id].label}</span>
    </button>
  );
}

export function CockpitRail({
  view,
  onChange,
  tone,
}: {
  view: DashboardView;
  onChange: (view: DashboardView) => void;
  tone: CockpitTone;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col overflow-y-auto bg-[#11282c] px-4 py-5 text-white lg:flex">
      <div className="flex items-center gap-3 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f15f48] text-sm font-black text-white shadow-[0_10px_25px_rgba(241,95,72,0.28)]">
          S
        </span>
        <div>
          <p className="text-sm font-black tracking-[-0.02em]">SBXS</p>
          <p className="font-mono text-mini uppercase tracking-[0.18em] text-slate-400">Control room</p>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-2 px-3 font-mono text-mini uppercase tracking-[0.16em] text-slate-500">
        <Command className="h-3 w-3" aria-hidden="true" />
        Navigate
      </div>
      <nav aria-label="Cockpit sections" className="mt-3 space-y-1">
        {primaryItems.map((item) => (
          <NavButton key={item.id} {...item} active={view === item.id} onChange={onChange} />
        ))}
      </nav>

      <div className="my-4 h-px bg-white/10" />
      <NavButton id="wall" icon={Presentation} active={view === "wall"} onChange={onChange} />

      <div className="mt-auto pt-8">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-mini uppercase tracking-[0.15em] text-slate-400">Telemetry</span>
            <span className={cn("h-2 w-2 rounded-full", statusClasses[tone])} aria-hidden="true" />
          </div>
          <p className="mt-2 text-petite font-semibold text-slate-100">
            {tone === "healthy" ? "All feeds nominal" : tone === "unknown" ? "Connecting" : "Review required"}
          </p>
          <p className="mt-1 text-mini leading-relaxed text-slate-500">Source health is evaluated separately from page refreshes.</p>
        </div>
        <div className="mt-4 flex items-center gap-2 px-2 text-mini text-slate-600">
          <Blocks className="h-3 w-3" aria-hidden="true" />
          Cockpit 2.0
        </div>
      </div>
    </aside>
  );
}

export function MobileCockpitNav({
  view,
  onChange,
}: {
  view: DashboardView;
  onChange: (view: DashboardView) => void;
}) {
  return (
    <nav aria-label="Cockpit sections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
      {[...primaryItems, { id: "wall" as const, icon: Presentation }].map(({ id, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={view === id ? "page" : undefined}
          className={cn(
            "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-petite font-bold",
            view === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/80 text-muted-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {VIEW_META[id].label}
        </button>
      ))}
    </nav>
  );
}
