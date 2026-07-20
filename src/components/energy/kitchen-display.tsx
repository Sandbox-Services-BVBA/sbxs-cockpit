"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { HouseFlow } from "./sections/house-flow";
import { buildRange } from "@/lib/energy-range";
import { EC, fmtSigned, fmtW, GRID_HOLD_MS, gd, statusLine, type Live } from "@/lib/energy-format";
import { useStablePower } from "@/hooks/use-stable-power";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const LIVE_MS = 3000;

interface ClimatePoint {
  t: number;
  temp: number | null;
  rh: number | null;
}
interface ClimateSeries {
  room: string;
  outdoor: boolean;
  points: ClimatePoint[];
}

// Always-on kitchen display for the Raspberry Pi: no navigation, no controls,
// no timeframe switcher. Live only, readable from across the room.
export function KitchenDisplay() {
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState<string>("");
  const range = buildRange("live", 0);

  const { data: live } = useSWR<Live>("/api/energy", fetcher, {
    refreshInterval: LIVE_MS,
    keepPreviousData: true,
    onSuccess: () => setTick((t) => t + 1),
  });
  // Only the newest sample of each room is needed, so ask for the shortest window.
  const { data: climate } = useSWR<{ series?: ClimateSeries[] }>("/api/energy?climate_history=1&hours=1", fetcher, {
    refreshInterval: 60000,
    keepPreviousData: true,
  });

  // Clock ticks locally so the wall display stays alive even if the feed stalls.
  useEffect(() => {
    const update = () => setNow(new Date().toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }));
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, []);

  const rawGrid = live ? gd(live.grid_w) : 0;
  const grid = useStablePower(rawGrid, tick, GRID_HOLD_MS);
  const status = live ? statusLine(live, grid) : null;
  const rooms = (climate?.series ?? [])
    .map((s) => {
      const last = [...s.points].reverse().find((p) => p.temp != null);
      return last ? { room: s.room, outdoor: s.outdoor, temp: last.temp, rh: last.rh } : null;
    })
    .filter((r): r is { room: string; outdoor: boolean; temp: number | null; rh: number | null } => r != null)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-[-0.03em] sm:text-4xl">Thuis</h1>
          {status && (
            <p className="mt-1 text-lg font-bold sm:text-xl" style={{ color: status.good ? EC.self : EC.import }}>
              {status.text}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-4xl font-black tabular-nums sm:text-5xl">{now}</p>
          <p className="mt-1 text-petite text-muted-foreground">
            {new Date().toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      </header>

      {!live ? (
        <div className="cockpit-panel px-4 py-16 text-center text-lg text-muted-foreground">Verbinden met energy-monitor...</div>
      ) : live.error ? (
        <div className="rounded-xl border border-red-600/35 bg-red-600/[0.08] px-4 py-6 text-center text-lg text-red-700 dark:text-red-300">
          Energy monitor: {live.error}
        </div>
      ) : (
        <div className="space-y-4">
          <HouseFlow range={range} live={live} tick={tick} intervalMs={LIVE_MS} compact />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <BigStat label="Zon" value={fmtW(live.solar_w)} color={EC.solar} />
            <BigStat
              label={grid === 0 ? "Net in balans" : grid > 0 ? "Van het net" : "Naar het net"}
              value={fmtW(Math.abs(grid))}
              color={grid === 0 ? EC.house : grid > 0 ? EC.import : EC.export}
              sub={grid !== rawGrid ? `ruw ${fmtSigned(rawGrid)}` : undefined}
            />
            <BigStat
              label="Batterij"
              value={live.soc_avg != null ? `${live.soc_avg}%` : "—"}
              color={EC.battery}
              sub={live.bat_w < -60 ? `laadt ${fmtW(-live.bat_w)}` : live.bat_w > 60 ? `ontlaadt ${fmtW(live.bat_w)}` : "idle"}
            />
            <BigStat label="Verbruik" value={fmtW(live.house_w)} color={EC.house} />
          </div>

          {rooms.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {rooms.map((r) => (
                <BigStat
                  key={r.room}
                  label={r.outdoor ? `${r.room} (buiten)` : r.room}
                  value={r.temp != null ? `${r.temp.toLocaleString("nl-BE", { maximumFractionDigits: 1 })}°` : "—"}
                  color={r.outdoor ? EC.house : EC.battery}
                  sub={r.rh != null ? `${Math.round(r.rh)}% vocht` : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BigStat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="cockpit-panel px-4 py-3">
      <p className="text-tiny font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-4xl font-black tabular-nums leading-none sm:text-5xl" style={{ color }}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-petite text-muted-foreground">{sub}</p>}
    </div>
  );
}
