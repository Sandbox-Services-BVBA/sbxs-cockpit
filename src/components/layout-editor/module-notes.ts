import { MODULE_BY_ID } from "@/lib/layout/catalog";
import type { ModuleDefinition } from "@/lib/layout/types";
import { VIEW_BY_ID } from "@/lib/views";

// One line per module saying what it is, for the editor row. The catalog is
// deliberately metadata-only, so this copy lives with the editor that reads
// it. A module without a note falls back to its owner domain's description.

const NOTES: Record<string, string> = {
  "alerts-summary": "Active incidents and warnings across everything monitored",
  "uptime-grid": "HTTP checks, response time and SSL days for every client site",
  cityscreens: "Which CityScreens players are online",
  domains: "Domain registrations coming up for renewal",
  "umami-plaq": "Plaq Studio visitors from Umami",
  "umami-byb": "BookYourBox visitors from Umami",
  "infra.summary": "One-line health rollup of servers, backups and jobs",
  servers: "Disk, RAM, CPU and uptime per server",
  gpu: "AI server GPU load, memory and temperature",
  backups: "Last successful backup per target",
  connections: "Gmail, Drive, API and other integration tokens",
  crons: "Scheduled jobs and their last exit status",
  services: "pm2, docker and systemd services on the dev server",
  unbilled: "Toggl hours not yet invoiced, per client",
  bank: "Current account balance",
  timeentries: "Most recent Toggl time entries",
  inbox: "Unread counts per Gmail inbox",
  mailroom: "Automated mail triage volume and priorities",
  whatsapp: "Recent WhatsApp activity via the bridge",
  agents: "Claude and Codex sessions running on the dev server",
  "file-activity": "Files changed recently under ~/projects",
  projects: "Projects with the newest git activity",
  "ai-usage": "Token spend per model this week",
  "file-explorer": "Browse and open files on the dev server",
  "home-control": "Office lights and scenes (live mode only)",
  "home.house": "The house picture: who is home, what is running, solar, grid and battery flow",
  "home.energy": "Power trend in live mode; energy totals over the period otherwise",
  "home.batteries": "Battery charge and cycles",
  "home.gas": "Gas use over the period (period mode only)",
  "home.water": "Water use and well pump days (period mode only)",
  "home.climate": "Temperature and humidity per room",
  "home.ventilation": "MVHR flow and mode, with controls (live mode only)",
  "home.airco": "Air conditioning state and controls (live mode only)",
  "home.raw-metrics": "Every raw energy metric, unfiltered (live mode only)",
  weight: "Fitbit weight trend",
  btc: "Bitcoin price and holdings",
};

export function moduleNote(definition: ModuleDefinition): string {
  return NOTES[definition.id] ?? VIEW_BY_ID[definition.ownerView].description;
}

export function moduleTitle(moduleId: string): string {
  return MODULE_BY_ID[moduleId]?.title ?? moduleId;
}
