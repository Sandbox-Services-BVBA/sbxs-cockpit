"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Snowflake } from "lucide-react";
import { Section, LivePulse } from "../ui";
import { cn } from "@/lib/utils";
import type { Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const REFRESH_MS = 30000;
// How long to wait after the last click before actually sending. Rapid clicks
// coalesce into one command. Tune here.
const DEBOUNCE_MS = 1800;
// After a send, pull fresh state a few times to catch the (slow) cloud confirming.
const CONFIRM_REFRESH_MS = [3000, 8000, 18000, 32000];

export interface AircoUnit {
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
  swingMode: string | null; // vertical vane
  swingModes: string[];
  swingHMode: string | null; // horizontal vane
  swingHModes: string[];
}

// Fire a control command to one unit; returns whether HA accepted it.
export async function sendAirco(id: string, patch: Desired): Promise<boolean> {
  try {
    const r = await fetch("/api/airco", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j?.ok !== false;
  } catch {
    return false;
  }
}

// Local desired overrides the user has set but the cloud hasn't confirmed yet.
export interface Desired {
  mode?: string;
  targetTemp?: number;
  fanMode?: string;
  swing?: string;
  swingH?: string;
}
type Phase = "idle" | "pending" | "sending" | "sent" | "confirmed" | "error";

const MODE_META: Record<string, { label: string; color: string }> = {
  off: { label: "Uit", color: "#94a3b8" },
  cool: { label: "Koelen", color: "#06b6d4" },
  heat: { label: "Verwarmen", color: "#f97316" },
  auto: { label: "Auto", color: "#22c55e" },
  dry: { label: "Drogen", color: "#9333ea" },
  fan_only: { label: "Ventileren", color: "#64748b" },
};
const MODE_ORDER = ["off", "cool", "heat", "auto", "dry", "fan_only"];
const PENDING = "#f59e0b"; // amber — a change not yet confirmed by the unit

function fanLabel(m: string): string {
  return m === "auto" ? "Auto" : m.replace("speed_", "");
}
function vaneVLabel(m: string): string {
  return m === "auto" ? "Auto" : m === "swing" ? "Zwenk" : m.replace("position_", "");
}
const VANE_H_LABEL: Record<string, string> = {
  auto: "Auto",
  swing: "Zwenk",
  left: "L",
  left_centre: "LC",
  centre: "C",
  right_centre: "RC",
  right: "R",
};
function fmt1(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Map a desired-field to the matching server value on the unit, for confirm checks.
function serverVal(u: AircoUnit, field: keyof Desired): string | number | null {
  switch (field) {
    case "mode":
      return u.mode;
    case "targetTemp":
      return u.targetTemp;
    case "fanMode":
      return u.fanMode;
    case "swing":
      return u.swingMode;
    case "swingH":
      return u.swingHMode;
  }
}

// A labelled row of small segmented buttons (fan / vane). Never disabled — the UI
// stays live; an unconfirmed selection is shown amber, a confirmed one primary.
function ControlRow({
  label,
  options,
  active,
  pending,
  onPick,
}: {
  label: string;
  options: { key: string; label: string }[];
  active: string | null;
  pending: boolean;
  onPick: (key: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-16 shrink-0 text-mini font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-1 flex-wrap gap-1">
        {options.map((o) => {
          const isActive = active === o.key;
          return (
            <button
              key={o.key}
              onClick={() => onPick(o.key)}
              className={cn(
                "min-w-[2rem] rounded-md border px-2 py-1 text-mini font-bold uppercase transition-colors",
                isActive
                  ? pending
                    ? "text-foreground"
                    : "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground",
              )}
              style={isActive && pending ? { borderColor: PENDING, background: `${PENDING}1a` } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Live status chip: shows exactly where a change is in its lifecycle.
function StatusChip({ phase }: { phase: Phase }) {
  const map: Record<Phase, { color: string; label: string; pulse?: boolean }> = {
    idle: { color: "#22c55e", label: "live" },
    pending: { color: PENDING, label: "wijziging…" },
    sending: { color: "#3b82f6", label: "verzenden…", pulse: true },
    sent: { color: "#3b82f6", label: "verzonden, wacht op unit" },
    confirmed: { color: "#22c55e", label: "bevestigd ✓" },
    error: { color: "#ef4444", label: "mislukt — opnieuw" },
  };
  const s = map[phase];
  return (
    <span className="flex items-center gap-1.5 text-mini font-bold uppercase tracking-wide" style={{ color: s.color }}>
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: s.color, animation: s.pulse ? "energy-heartbeat 1s ease-out infinite" : undefined }}
      />
      {s.label}
    </span>
  );
}

// One unit's card. Owns its optimistic desired-state + debounce + send lifecycle,
// so controls never block: you keep clicking, it batches and sends after you stop.
export function AircoUnitCard({ unit, onSend, onRefresh }: { unit: AircoUnit; onSend: (patch: Desired) => Promise<boolean>; onRefresh: () => void }) {
  const [desired, setDesiredState] = useState<Desired>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const desiredRef = useRef<Desired>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const applyDesired = useCallback((next: Desired) => {
    desiredRef.current = next;
    setDesiredState(next);
  }, []);

  const clearConfirmTimers = () => {
    confirmTimers.current.forEach(clearTimeout);
    confirmTimers.current = [];
  };

  const flush = useCallback(() => {
    const snap = { ...desiredRef.current };
    if (Object.keys(snap).length === 0) return;
    setPhase("sending");
    onSend(snap).then((ok) => {
      if (!ok) {
        setPhase("error");
        return;
      }
      setPhase("sent");
      clearConfirmTimers();
      confirmTimers.current = CONFIRM_REFRESH_MS.map((ms) => setTimeout(onRefresh, ms));
      // If the user kept changing things while this was in flight, send again.
      const cur = desiredRef.current;
      const hasNewer = Object.keys(cur).some((k) => String(cur[k as keyof Desired]) !== String(snap[k as keyof Desired]));
      if (hasNewer) {
        setPhase("pending");
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, DEBOUNCE_MS);
      }
    });
  }, [onSend, onRefresh]);

  const change = useCallback(
    (patch: Desired) => {
      applyDesired({ ...desiredRef.current, ...patch });
      setPhase("pending");
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [applyDesired, flush],
  );

  const sendNow = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flush();
  }, [flush]);

  // When fresh server data arrives, drop any desired field the unit now matches.
  useEffect(() => {
    const cur = desiredRef.current;
    if (Object.keys(cur).length === 0) return;
    const next: Desired = { ...cur };
    let changed = false;
    (Object.keys(next) as (keyof Desired)[]).forEach((k) => {
      if (String(next[k]) === String(serverVal(unit, k))) {
        delete next[k];
        changed = true;
      }
    });
    if (changed) applyDesired(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.mode, unit.targetTemp, unit.fanMode, unit.swingMode, unit.swingHMode]);

  // Once everything the user asked for is reflected by the unit, flash "confirmed".
  useEffect(() => {
    if (Object.keys(desired).length === 0 && (phase === "sent" || phase === "sending")) {
      setPhase("confirmed");
      const t = setTimeout(() => setPhase("idle"), 1800);
      return () => clearTimeout(t);
    }
  }, [desired, phase]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      clearConfirmTimers();
    },
    [],
  );

  // Displayed values = desired override (if any) else server truth.
  const view = {
    mode: desired.mode ?? unit.mode,
    targetTemp: desired.targetTemp ?? unit.targetTemp,
    fanMode: desired.fanMode ?? unit.fanMode,
    swing: desired.swing ?? unit.swingMode,
    swingH: desired.swingH ?? unit.swingHMode,
  };
  const on = view.mode !== "off";
  const meta = MODE_META[view.mode] ?? MODE_META.off;
  const modes = MODE_ORDER.filter((m) => unit.hvacModes.includes(m));
  const canTemp = on && view.mode !== "fan_only" && view.mode !== "dry" && view.targetTemp != null;
  const dirty = (f: keyof Desired) => f in desired;

  const stepTemp = (d: number) => {
    const base = view.targetTemp ?? 20;
    change({ targetTemp: Math.min(35, Math.max(7, Math.round((base + d) * 2) / 2)) });
  };

  return (
    <div className="rounded-xl border border-border/80 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">{unit.name}</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-bold tabular-nums leading-none">{fmt1(unit.currentTemp)}</span>
            <span className="text-base font-semibold text-muted-foreground">°C nu</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="rounded-lg border px-2.5 py-1 text-tiny font-bold uppercase tracking-wide"
            style={{ borderColor: meta.color, color: meta.color, background: on ? `${meta.color}1a` : "transparent" }}
          >
            {unit.available ? meta.label : "offline"}
          </span>
          <StatusChip phase={phase} />
        </div>
      </div>

      {/* Mode */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {modes.map((m) => {
          const mm = MODE_META[m] ?? { label: m, color: "#94a3b8" };
          const isActive = view.mode === m;
          const isPending = dirty("mode") && isActive;
          return (
            <button
              key={m}
              onClick={() => change({ mode: m })}
              className={cn(
                "rounded-lg border px-1 py-2 text-tiny font-bold uppercase tracking-wide transition-colors",
                isActive ? "text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground",
              )}
              style={isActive ? { borderColor: isPending ? PENDING : mm.color, background: `${isPending ? PENDING : mm.color}1a` } : undefined}
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
            <button onClick={() => stepTemp(-0.5)} className="h-8 w-8 rounded-lg border border-border text-lg font-bold text-muted-foreground hover:border-muted-foreground">
              −
            </button>
            <span className="w-16 text-center text-2xl font-bold tabular-nums" style={{ color: dirty("targetTemp") ? PENDING : meta.color }}>
              {fmt1(view.targetTemp)}°
            </span>
            <button onClick={() => stepTemp(0.5)} className="h-8 w-8 rounded-lg border border-border text-lg font-bold text-muted-foreground hover:border-muted-foreground">
              +
            </button>
          </div>
        </div>
      )}

      {/* Fan speed + vertical/horizontal vane — only meaningful while on */}
      {on && (
        <div className="mt-1">
          <ControlRow
            label="Vent."
            options={unit.fanModes.map((m) => ({ key: m, label: fanLabel(m) }))}
            active={view.fanMode}
            pending={dirty("fanMode")}
            onPick={(k) => change({ fanMode: k })}
          />
          <ControlRow
            label="Lam. ↕"
            options={unit.swingModes.map((m) => ({ key: m, label: vaneVLabel(m) }))}
            active={view.swing}
            pending={dirty("swing")}
            onPick={(k) => change({ swing: k })}
          />
          <ControlRow
            label="Lam. ↔"
            options={unit.swingHModes.map((m) => ({ key: m, label: VANE_H_LABEL[m] ?? m }))}
            active={view.swingH}
            pending={dirty("swingH")}
            onPick={(k) => change({ swingH: k })}
          />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="text-mini text-muted-foreground">
          {on ? <>doel {fmt1(view.targetTemp)}° · {unit.action ?? "aan"}</> : "uit"}
        </div>
        {(phase === "pending" || phase === "error") && (
          <button onClick={sendNow} className="rounded-md border px-2 py-0.5 text-mini font-bold uppercase tracking-wide" style={{ borderColor: PENDING, color: PENDING }}>
            {phase === "error" ? "opnieuw" : "nu verzenden →"}
          </button>
        )}
      </div>
    </div>
  );
}

export function Airco({ range }: { range: Range }) {
  const isLive = range.mode === "live";
  const [tick, setTick] = useState(0);

  const { data, mutate } = useSWR<{ units: AircoUnit[]; error?: string }>(isLive ? "/api/airco" : null, fetcher, {
    refreshInterval: REFRESH_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });

  const send = useCallback(
    async (id: string, patch: Desired): Promise<boolean> => {
      try {
        const r = await fetch("/api/airco", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
        const j = await r.json().catch(() => ({}));
        return r.ok && j?.ok !== false;
      } catch {
        return false;
      }
    },
    [],
  );
  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

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
          {units.map((u) => (
            <AircoUnitCard key={u.id} unit={u} onSend={(patch) => send(u.id, patch)} onRefresh={refresh} />
          ))}
          <p className="text-mini text-muted-foreground">
            Wijzigingen worden gebundeld en na ~{DEBOUNCE_MS / 1000}s automatisch verzonden. Amber = nog niet bevestigd door de unit, groen = bevestigd.
          </p>
        </div>
      )}
    </Section>
  );
}
