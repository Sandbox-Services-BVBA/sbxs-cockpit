"use client";

import { useState } from "react";
import useSWR from "swr";
import { Snowflake } from "lucide-react";
import { Section, LivePulse } from "../ui";
import { cn } from "@/lib/utils";
import type { Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const REFRESH_MS = 30000;

interface AircoUnit {
  id: string;
  name: string;
  room: string | null;
  floor: string | null;
  available: boolean;
  on: boolean;
  mode: string; // off | cool | heat | auto | dry | fan_only
  action: string | null;
  currentTemp: number | null;
  targetTemp: number | null;
  fanMode: string | null;
  fanModes: string[];
  hvacModes: string[];
}

const MODE_META: Record<string, { label: string; color: string }> = {
  off: { label: "Uit", color: "#94a3b8" },
  cool: { label: "Koelen", color: "#06b6d4" },
  heat: { label: "Verwarmen", color: "#f97316" },
  auto: { label: "Auto", color: "#22c55e" },
  dry: { label: "Drogen", color: "#9333ea" },
  fan_only: { label: "Ventileren", color: "#64748b" },
};
const MODE_ORDER = ["off", "cool", "heat", "auto", "dry", "fan_only"];

function fmt1(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function Airco({ range }: { range: Range }) {
  const isLive = range.mode === "live";
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, mutate } = useSWR<{ units: AircoUnit[]; error?: string }>(isLive ? "/api/airco" : null, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });

  if (!isLive) {
    return (
      <Section title="Airco" icon={Snowflake}>
        <p className="text-petite text-muted-foreground">Airco-bediening is enkel live beschikbaar.</p>
      </Section>
    );
  }
  if (data?.error) {
    return (
      <Section title="Airco" icon={Snowflake}>
        <p className="text-petite text-[#ff4444]">Bridge: {data.error}</p>
      </Section>
    );
  }
  if (!data) {
    return (
      <Section title="Airco" icon={Snowflake}>
        <p className="text-petite text-muted-foreground">Verbinden met home-bridge...</p>
      </Section>
    );
  }

  const units = data.units ?? [];

  // Optimistically patches the shared "/api/airco" cache so the button and the
  // house hero (same SWR key) update in the same tick, then re-fetches truth.
  const control = async (unit: AircoUnit, body: Record<string, unknown>, key: string, patch: Partial<AircoUnit>) => {
    setBusy(key);
    try {
      await mutate(
        fetch("/api/airco", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: unit.id, ...body }),
        }).then(() => fetcher("/api/airco")),
        {
          optimisticData: () => ({ units: units.map((u) => (u.id === unit.id ? { ...u, ...patch } : u)) }),
          rollbackOnError: true,
        },
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Airco — sturing"
      icon={Snowflake}
      right={<LivePulse intervalMs={REFRESH_MS} tick={tick} label={`${units.length} ${units.length === 1 ? "unit" : "units"} · MELCloud`} />}
    >
      {units.length === 0 ? (
        <p className="text-petite text-muted-foreground">Nog geen airco-units gekoppeld. Koppel ze in de MELCloud Home app.</p>
      ) : (
        <div className="space-y-3">
          {units.map((u) => {
            const meta = MODE_META[u.mode] ?? MODE_META.off;
            const modes = MODE_ORDER.filter((m) => u.hvacModes.includes(m));
            const canTemp = u.on && u.mode !== "fan_only" && u.mode !== "dry" && u.targetTemp != null;
            return (
              <div key={u.id} className="rounded-xl border border-border/80 bg-background/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">{u.name}</div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-3xl font-bold tabular-nums leading-none">{fmt1(u.currentTemp)}</span>
                      <span className="text-base font-semibold text-muted-foreground">°C nu</span>
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-lg border px-2.5 py-1 text-tiny font-bold uppercase tracking-wide"
                    style={{ borderColor: meta.color, color: meta.color, background: u.on ? `${meta.color}1a` : "transparent" }}
                  >
                    {u.available ? meta.label : "offline"}
                  </span>
                </div>

                {/* Mode */}
                <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {modes.map((m) => {
                    const mm = MODE_META[m] ?? { label: m, color: "#94a3b8" };
                    const key = `${u.id}:mode:${m}`;
                    const activeMode = u.mode === m;
                    return (
                      <button
                        key={m}
                        disabled={busy !== null || !u.available}
                        onClick={() => control(u, { mode: m }, key, { mode: m, on: m !== "off" })}
                        className={cn(
                          "rounded-lg border px-1 py-2 text-tiny font-bold uppercase tracking-wide transition-colors",
                          activeMode ? "text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground",
                          busy === key && "opacity-50",
                        )}
                        style={activeMode ? { borderColor: mm.color, background: `${mm.color}1a` } : undefined}
                      >
                        {mm.label}
                      </button>
                    );
                  })}
                </div>

                {/* Target temperature */}
                {canTemp && (
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Doel</span>
                    <div className="flex items-center gap-3">
                      <button
                        disabled={busy !== null}
                        onClick={() => control(u, { targetTemp: (u.targetTemp as number) - 0.5 }, `${u.id}:temp-`, { targetTemp: (u.targetTemp as number) - 0.5 })}
                        className="h-8 w-8 rounded-lg border border-border text-lg font-bold text-muted-foreground hover:border-muted-foreground disabled:opacity-50"
                      >
                        −
                      </button>
                      <span className="w-16 text-center text-2xl font-bold tabular-nums" style={{ color: meta.color }}>
                        {fmt1(u.targetTemp)}°
                      </span>
                      <button
                        disabled={busy !== null}
                        onClick={() => control(u, { targetTemp: (u.targetTemp as number) + 0.5 }, `${u.id}:temp+`, { targetTemp: (u.targetTemp as number) + 0.5 })}
                        className="h-8 w-8 rounded-lg border border-border text-lg font-bold text-muted-foreground hover:border-muted-foreground disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2 text-mini text-muted-foreground">
                  {u.on ? (
                    <>
                      doel {fmt1(u.targetTemp)}° · ventilator {u.fanMode ?? "?"}
                      {u.action ? ` · ${u.action}` : ""}
                    </>
                  ) : (
                    "uit"
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
