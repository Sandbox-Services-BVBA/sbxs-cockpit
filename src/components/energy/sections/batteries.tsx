"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { BatteryCharging } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Section } from "../ui";
import { cn } from "@/lib/utils";
import { EC, fmtW, fmtKwh, type Battery, type HistPoint, type Live } from "@/lib/energy-format";
import type { Range } from "@/lib/energy-range";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function timeFmt(bucket: Range["bucket"]) {
  if (bucket === "day") return (t: number) => new Date(t * 1000).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
  if (bucket === "month") return (t: number) => new Date(t * 1000).toLocaleDateString("nl-BE", { month: "short" });
  return (t: number) => new Date(t * 1000).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
}

// Vertical battery cell with charge/discharge packet animation (cockpit style).
function Cell({ index, b }: { index: number; b: Battery }) {
  const charging = b.online && b.power_w < 0;
  const discharging = b.online && b.power_w > 0;
  const pct = Math.max(0, Math.min(100, b.soc ?? 0));
  const state = !b.online ? "offline" : charging ? "laden" : discharging ? "ontladen" : "idle";
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-col items-center">
        <div className="h-2 w-6 bg-border" />
        <div className="relative h-28 w-14 overflow-hidden border-2 border-border bg-muted/30">
          <div
            className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out", charging && "batt-glow")}
            style={{ height: `${pct}%`, background: b.online ? EC.battery : "#71717a" }}
          />
          {(charging || discharging) &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="batt-packet absolute bottom-1 h-1.5 w-1.5"
                style={{
                  left: `${20 + i * 26}%`,
                  background: charging ? "rgba(34,197,94,0.9)" : "rgba(245,158,11,0.9)",
                  animationName: charging ? "batt-rise" : "batt-fall",
                  animationDuration: `${1.9 + i * 0.3}s`,
                  animationDelay: `${i * 0.45}s`,
                }}
              />
            ))}
        </div>
      </div>
      <div className="text-center leading-tight">
        <div className="text-tiny font-mono text-muted-foreground">Batterij {index}</div>
        <div className="text-lg font-bold tabular-nums" style={{ color: EC.battery }}>
          {b.capacity_wh != null ? fmtKwh(b.capacity_wh / 1000) : "—"} kWh
        </div>
        <div className="text-tiny font-mono text-muted-foreground">
          {b.soc ?? "—"}% · {fmtKwh(b.rated_wh / 1000)} kWh
        </div>
        <div className="text-tiny font-mono" style={{ color: charging || discharging ? EC.battery : undefined }}>
          {state}
          {b.online && b.power_w !== 0 ? ` ${fmtW(Math.abs(b.power_w))}` : ""}
        </div>
      </div>
    </div>
  );
}

interface ChartTip {
  active?: boolean;
  payload?: Array<{ payload: { t: number; bat: number | null; stored_kwh: number | null } }>;
}
function BatTooltip({ active, payload }: ChartTip) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const time = new Date(d.t * 1000).toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-0.5 border border-border bg-popover px-2 py-1 text-petite shadow-lg">
      <div className="font-bold text-muted-foreground">{time}</div>
      <div style={{ color: EC.battery }}>{d.bat == null ? "—" : d.bat >= 0 ? `Laden ${fmtW(d.bat)}` : `Ontladen ${fmtW(-d.bat)}`}</div>
      <div style={{ color: EC.battery }}>Lading {d.stored_kwh == null ? "—" : `${fmtKwh(d.stored_kwh)} kWh`}</div>
    </div>
  );
}

export function Batteries({ live, range }: { live: Live; range: Range }) {
  const { data: hist } = useSWR<{ points: HistPoint[] }>(`/api/energy?start=${range.start}&end=${range.fetchEnd}`, fetcher, {
    refreshInterval: range.canNext ? 0 : range.mode === "live" ? 3000 : 30000,
    keepPreviousData: true,
  });
  const xFmt = timeFmt(range.bucket);

  // Flip battery sign so charging reads "up" (positive) like HomeWizard.
  const data = useMemo(
    () =>
      (hist?.points ?? []).map((p) => ({
        t: p.t,
        bat: p.bat_w == null ? null : -p.bat_w,
        stored_kwh: p.stored_wh == null ? null : Math.round(p.stored_wh / 100) / 10,
      })),
    [hist]
  );

  const storedKwh = fmtKwh(live.stored_wh / 1000);
  const ratedKwh = fmtKwh(live.rated_wh / 1000);
  const ratedNum = live.rated_wh / 1000;

  return (
    <Section
      title="Thuisbatterijen"
      icon={BatteryCharging}
      right={<span className="font-mono text-tiny text-muted-foreground">{storedKwh} / {ratedKwh} kWh · {live.soc_avg ?? "—"}%</span>}
    >
      <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
        {/* Battery cells */}
        <div className="flex items-start justify-center gap-6 border-2 border-border px-4 py-4 sm:gap-8">
          {live.batteries.map((b, i) => (
            <Cell key={b.ip} index={i + 1} b={b} />
          ))}
        </div>

        {/* Charge/discharge + stored charge chart */}
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-tiny font-bold uppercase tracking-widest text-muted-foreground">Laden / ontladen · lading</span>
            <span className="text-mini italic text-muted-foreground">boven 0 = laden · onder 0 = ontladen</span>
          </div>
          <div className="h-48 -mx-1 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="batArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                    <stop offset="50%" stopColor={EC.battery} stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickFormatter={xFmt}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis yAxisId="w" orientation="right" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : `${v}`)} />
                <YAxis yAxisId="kwh" orientation="left" domain={[0, Math.ceil(ratedNum)]} tick={{ fontSize: 8, fill: EC.battery }} tickLine={false} axisLine={false} width={28} />
                <Tooltip content={<BatTooltip />} />
                <ReferenceLine yAxisId="w" y={0} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                <Area yAxisId="w" type="linear" dataKey="bat" baseValue={0} stroke={EC.battery} fill="url(#batArea)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="kwh" type="linear" dataKey="stored_kwh" stroke={EC.battery} strokeWidth={2} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-mini text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: "#22c55e" }} />laden</span>
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: "#f59e0b" }} />ontladen</span>
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-3" style={{ background: EC.battery }} />lading (kWh, stippellijn)</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
