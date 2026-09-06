"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isSourceStale } from "@/lib/dashboard-health";
import type { ThermalHistory, ThermalStatus } from "@/types";
import { Pane, PaneEmpty, type PaneTone } from "../infra/pane";

const CPU_COLOR = "var(--coral)";
const CCD_COLOR = "var(--amber)";
const RAD_COLOR = "var(--blue)";
const PUMP_COLOR = "var(--purple)";
const CASE_COLOR = "var(--green)";

/**
 * The Ryzen 7 3700X throttles at 95 C. 80 is the line we agreed to keep peak
 * load under while trading temperature for silence, so it is drawn as the
 * budget marker rather than the danger one.
 */
const TEMP_BUDGET_C = 80;

/**
 * The pump sits near 3500 rpm on its flat 70% BIOS curve. Anything under this
 * means it is not really turning, which is the one failure that cooks the CPU
 * in seconds. Matches the alert threshold in /api/status.
 */
const PUMP_FLOOR_RPM = 1500;

interface ChartPoint {
  time: number;
  tctl: number | null;
  tccd: number | null;
  rad: number | null;
  pump: number | null;
  caseFan: number | null;
}

function timestampMs(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return Date.parse(normalized);
}

function ageLabel(value: string) {
  const parsed = timestampMs(value);
  if (Number.isNaN(parsed)) return "time unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - parsed) / 60000));
  if (minutes < 1) return "live now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function num(value: number | null, digits = 0, suffix = "") {
  return value === null || value === undefined ? "--" : `${value.toFixed(digits)}${suffix}`;
}

function toneFor(thermals: ThermalStatus | null): PaneTone {
  if (!thermals) return "idle";
  if (!thermals.available) return "bad";
  if (isSourceStale(thermals.captured_at)) return "warn";
  // A stopped pump outranks temperature: it is the cause, not the symptom.
  if (thermals.fan_pump_rpm !== null && thermals.fan_pump_rpm < PUMP_FLOOR_RPM) return "bad";
  const cpu = thermals.cpu_tctl_c;
  if (cpu !== null && cpu >= 85) return "bad";
  if (cpu !== null && cpu >= TEMP_BUDGET_C) return "warn";
  return "ok";
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line-soft bg-ink/[0.025] px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-mono text-lg font-bold leading-none tabular-nums text-ink">{value}</p>
      <p className="mt-1 truncate text-mini text-ink-quiet" title={note}>{note}</p>
    </div>
  );
}

function timeTick(value: number) {
  return new Date(value).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
}

function tooltipLabel(value: number) {
  return new Date(value).toLocaleString("nl-BE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  color: "var(--ink)",
  fontFamily: "var(--mono)",
  fontSize: 11,
};

const TEMP_NAMES: Record<string, string> = { tctl: "CPU (Tctl)", tccd: "Die (Tccd1)" };
const FAN_NAMES: Record<string, string> = { rad: "Rad fans", pump: "Pump", caseFan: "Case" };

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function HistoryCharts({ points }: { points: ChartPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-petite text-ink-quiet @xl:min-h-40">
        24-hour history will appear after the next agent sample.
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3 @3xl:grid-cols-2">
      <figure
        className="min-w-0 rounded-xl border border-line-soft bg-ink/[0.018] p-2.5"
        aria-label="Proxmox host CPU temperature over the last 24 hours"
      >
        <figcaption className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <span className="eyebrow">Temperature · 24h</span>
          <span className="flex gap-3 font-mono text-mini text-ink-quiet">
            <LegendDot color={CPU_COLOR} label="Tctl" />
            <LegendDot color={CCD_COLOR} label="Tccd1" />
          </span>
        </figcaption>
        <div className="h-36 w-full @xl:h-40">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 144 }}>
            <ComposedChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line-soft)" strokeDasharray="2 5" vertical={false} />
              <XAxis
                dataKey="time" type="number" domain={["dataMin", "dataMax"]}
                tickFormatter={timeTick} tick={{ fontSize: 9, fill: "var(--ink-quiet)" }}
                tickLine={false} axisLine={false} minTickGap={42}
              />
              <YAxis
                domain={[20, 100]} tickFormatter={(value) => `${value}°`}
                tick={{ fontSize: 9, fill: "var(--ink-quiet)" }}
                tickLine={false} axisLine={false} width={38}
              />
              <ReferenceLine
                y={TEMP_BUDGET_C} stroke="var(--amber)" strokeDasharray="4 4" strokeOpacity={0.5}
                label={{ value: "80° budget", position: "insideTopRight", fontSize: 9, fill: "var(--ink-quiet)" }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(value) => tooltipLabel(Number(value))}
                formatter={(value, name) => [`${Number(value).toFixed(1)} °C`, TEMP_NAMES[String(name)] ?? String(name)]}
              />
              <Area type="monotone" dataKey="tccd" stroke={CCD_COLOR} fill={CCD_COLOR} fillOpacity={0.1} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="tctl" stroke={CPU_COLOR} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure
        className="min-w-0 rounded-xl border border-line-soft bg-ink/[0.018] p-2.5"
        aria-label="Proxmox host fan and pump speeds over the last 24 hours"
      >
        <figcaption className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <span className="eyebrow">Fans + pump · 24h</span>
          <span className="flex gap-3 font-mono text-mini text-ink-quiet">
            <LegendDot color={PUMP_COLOR} label="pump" />
            <LegendDot color={RAD_COLOR} label="rad" />
            <LegendDot color={CASE_COLOR} label="case" />
          </span>
        </figcaption>
        <div className="h-36 w-full @xl:h-40">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 144 }}>
            <ComposedChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line-soft)" strokeDasharray="2 5" vertical={false} />
              <XAxis
                dataKey="time" type="number" domain={["dataMin", "dataMax"]}
                tickFormatter={timeTick} tick={{ fontSize: 9, fill: "var(--ink-quiet)" }}
                tickLine={false} axisLine={false} minTickGap={42}
              />
              <YAxis
                domain={[0, "auto"]} tickFormatter={(value) => `${value}`}
                tick={{ fontSize: 9, fill: "var(--ink-quiet)" }}
                tickLine={false} axisLine={false} width={44}
              />
              <ReferenceLine y={PUMP_FLOOR_RPM} stroke="var(--coral)" strokeDasharray="4 4" strokeOpacity={0.45} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(value) => tooltipLabel(Number(value))}
                formatter={(value, name) => [`${Number(value).toFixed(0)} rpm`, FAN_NAMES[String(name)] ?? String(name)]}
              />
              <Line type="monotone" dataKey="pump" stroke={PUMP_COLOR} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="rad" stroke={RAD_COLOR} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="caseFan" stroke={CASE_COLOR} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}

export function ThermalsWidget({
  thermals,
  history,
}: {
  thermals: ThermalStatus | null;
  history: ThermalHistory[];
}) {
  const tone = toneFor(thermals);
  const readout = !thermals
    ? "not reported"
    : !thermals.available
      ? "unavailable"
      : isSourceStale(thermals.captured_at)
        ? `stale · ${ageLabel(thermals.captured_at)}`
        : ageLabel(thermals.captured_at);

  const points: ChartPoint[] = history
    .map((row) => ({
      time: timestampMs(row.checked_at),
      tctl: row.cpu_tctl_c,
      tccd: row.cpu_tccd_c,
      rad: row.fan_cpu_rpm,
      pump: row.fan_pump_rpm,
      caseFan: row.fan_case_rpm,
    }))
    .filter((point) => !Number.isNaN(point.time));

  const pumpStopped =
    thermals?.fan_pump_rpm !== null &&
    thermals?.fan_pump_rpm !== undefined &&
    thermals.fan_pump_rpm < PUMP_FLOOR_RPM;

  return (
    <Pane title="Thermals" tone={tone} readout={readout}>
      {!thermals ? (
        <PaneEmpty>The cockpit agent has not reported host thermals yet.</PaneEmpty>
      ) : !thermals.available ? (
        <PaneEmpty>{thermals.error || "Could not read sensors on the Proxmox host."}</PaneEmpty>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="serif text-base text-ink">{thermals.host}</h3>
            <span className="font-mono text-mini text-ink-quiet">Ryzen 7 3700X · GAMING 360 AIO</span>
          </div>

          {pumpStopped && (
            <p className="rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-petite text-ink">
              AIO pump reads {num(thermals.fan_pump_rpm, 0)} rpm. It should sit near 3500 on its
              flat 70% BIOS curve — check it before the CPU heats up.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
            <Metric
              label="CPU"
              value={num(thermals.cpu_tctl_c, 1, " °C")}
              note={`die ${num(thermals.cpu_tccd_c, 1, " °C")} · throttles at 95`}
            />
            <Metric
              label="Pump"
              value={num(thermals.fan_pump_rpm, 0)}
              note={`rpm · ${num(thermals.pwm_pump_percent, 0, "%")} duty`}
            />
            <Metric
              label="Rad fans"
              value={num(thermals.fan_cpu_rpm, 0)}
              note={`rpm · rated 500-2200`}
            />
            <Metric
              label="Case fans"
              value={num(thermals.fan_case_rpm, 0)}
              note={`rpm · hub, not controllable`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metric label="Board" value={num(thermals.board_temp_c, 0, " °C")} note="motherboard sensor" />
            <Metric label="NVMe" value={num(thermals.nvme_max_c, 0, " °C")} note="hottest of the two" />
            <Metric label="RAM" value={num(thermals.ram_max_c, 0, " °C")} note="hottest DIMM" />
          </div>

          <HistoryCharts points={points} />
        </div>
      )}
    </Pane>
  );
}
