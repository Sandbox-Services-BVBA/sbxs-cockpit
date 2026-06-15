"use client";

import { useState } from "react";
import useSWR from "swr";
import { WidgetTile } from "../widget-tile";
import { cn } from "@/lib/utils";
import { Guitar, Sun, Sunset, Moon, CloudSun, Power, Monitor } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface HomeLight {
  id: string;
  name: string;
  available: boolean;
  on: boolean;
  rgb: [number, number, number] | null;
  brightness: number | null;
}
interface HomeSwitch {
  id: string;
  name: string;
  available: boolean;
  on: boolean;
}
interface HomeState {
  lights: HomeLight[];
  switches: HomeSwitch[];
  scenes: { id: string; label: string }[];
  proxmox: { rgb: [number, number, number] | null; enabled: boolean };
  activeScene: string | null;
  error?: string;
}

const SCENE_ICONS: Record<string, typeof Guitar> = {
  guitar: Guitar,
  "evening-work": Sunset,
  "night-work": Moon,
  "bright-day-work": Sun,
  "calm-day-work": CloudSun,
  "all-off": Power,
};

function rgbCss(rgb: [number, number, number] | null) {
  return rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "transparent";
}

async function post(action: string, payload: Record<string, unknown>) {
  await fetch("/api/home", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
}

export function HomeControlWidget() {
  const { data, mutate, isLoading } = useSWR<HomeState>("/api/home", fetcher, {
    refreshInterval: 15000,
    dedupingInterval: 5000,
    keepPreviousData: true,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  if (data?.error) {
    return (
      <WidgetTile title="Office" size="md">
        <p className="text-petite text-[#ff4444]">Bridge: {data.error}</p>
      </WidgetTile>
    );
  }
  if (isLoading && !data) {
    return (
      <WidgetTile title="Office" size="md">
        <p className="text-petite text-muted-foreground">Connecting to home bridge...</p>
      </WidgetTile>
    );
  }

  const scenes = data?.scenes ?? [];
  const lights = data?.lights ?? [];
  const switches = data?.switches ?? [];
  const active = data?.activeScene ?? null;

  return (
    <WidgetTile
      title="Office"
      size="md"
      headerRight={
        <span className="flex items-center gap-1 text-mini text-muted-foreground font-mono">
          <Monitor className="h-2.5 w-2.5" />
          {data?.proxmox?.enabled ? (
            <span className="inline-block h-2.5 w-2.5 border border-border" style={{ background: rgbCss(data.proxmox.rgb) }} />
          ) : (
            <span title="RGB controller owned by Windows VM">off</span>
          )}
        </span>
      }
    >
      <div className="space-y-2">
        {/* Scenes */}
        <div className="grid grid-cols-3 gap-1">
          {scenes.map((s) => {
            const Icon = SCENE_ICONS[s.id] ?? Sun;
            const isActive = active === s.id;
            const key = `scene:${s.id}`;
            return (
              <button
                key={s.id}
                disabled={busy !== null}
                onClick={() => run(key, () => post("scene", { name: s.id }))}
                className={cn(
                  "flex flex-col items-center gap-0.5 border-2 px-1 py-1.5 transition-colors",
                  isActive ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground",
                  busy === key && "opacity-50"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-mini font-bold uppercase tracking-wide leading-tight text-center">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Quick toggles */}
        <div className="space-y-0.5">
          {switches.map((sw) => {
            const key = `switch:${sw.id}`;
            return (
              <button
                key={sw.id}
                disabled={busy !== null || !sw.available}
                onClick={() => run(key, () => post("switch", { id: sw.id, on: !sw.on }))}
                className={cn(
                  "flex w-full items-center gap-2 px-1 py-0.5 hover:bg-muted/50 disabled:opacity-40",
                  busy === key && "opacity-50"
                )}
              >
                <span className={cn("h-1.5 w-1.5 shrink-0", sw.on ? "bg-emerald-500" : "bg-zinc-500")} />
                <span className="text-petite truncate flex-1 text-left">{sw.name}</span>
                <span className="text-mini font-mono text-muted-foreground">{sw.on ? "ON" : "OFF"}</span>
              </button>
            );
          })}
        </div>

        {/* Light status (read-only at-a-glance) */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-border pt-1">
          {lights.map((l) => (
            <div key={l.id} className="flex items-center gap-1.5">
              <span
                className={cn("h-2 w-2 shrink-0 border border-border", !l.on && "opacity-30")}
                style={{ background: l.on ? rgbCss(l.rgb) : "transparent" }}
              />
              <span className="text-mini text-muted-foreground truncate flex-1">{l.name}</span>
              {l.on && l.brightness != null && (
                <span className="text-micro font-mono text-muted-foreground">{l.brightness}%</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </WidgetTile>
  );
}
