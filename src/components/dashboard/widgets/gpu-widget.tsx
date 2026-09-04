"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isSourceStale } from "@/lib/dashboard-health";
import type { GpuDeviceMetric, GpuMetricHistory, GpuStatus } from "@/types";
import { Pane, PaneEmpty, type PaneTone } from "../infra/pane";

const LOAD_COLOR = "var(--blue)";
const MEMORY_COLOR = "var(--purple)";
const TEMPERATURE_COLOR = "var(--coral)";
const POWER_COLOR = "var(--amber)";

interface ChartPoint {
  time: number;
  utilization: number | null;
  memory: number | null;
  temperature: number | null;
  power: number | null;
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

function formatNumber(value: number | null, digits = 0) {
  return value === null ? "--" : value.toFixed(digits);
}

function formatMemory(value: number | null) {
  return value === null ? "--" : (value / 1024).toFixed(1);
}

function memoryPercent(sample: Pick<GpuDeviceMetric, "memory_used_mb" | "memory_total_mb">) {
  if (sample.memory_used_mb === null || !sample.memory_total_mb) return null;
  return Math.min(100, (sample.memory_used_mb / sample.memory_total_mb) * 100);
}

function toneFor(gpu: GpuStatus | null): PaneTone {
  if (!gpu) return "idle";
  if (!gpu.available) return "bad";
  if (isSourceStale(gpu.captured_at)) return "warn";
  const temperature = Math.max(...gpu.devices.map((device) => device.temperature_c ?? 0));
  if (temperature >= 85) return "bad";
  if (temperature >= 75) return "warn";
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

function HistoryCharts({ points }: { points: ChartPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-petite text-ink-quiet sm:min-h-40">
        24-hour history will appear after the next agent sample.
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <figure className="min-w-0 rounded-xl border border-line-soft bg-ink/[0.018] p-2.5" aria-label="GPU load and video memory over the last 24 hours">
        <figcaption className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <span className="eyebrow">Load + memory · 24h</span>
          <span className="flex gap-3 font-mono text-mini text-ink-quiet">
            <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: LOAD_COLOR }} />GPU</span>
            <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: MEMORY_COLOR }} />VRAM</span>
          </span>
        </figcaption>
        <div className="h-36 w-full sm:h-40">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 144 }}>
            <ComposedChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line-soft)" strokeDasharray="2 5" vertical={false} />
              <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={timeTick} tick={{ fontSize: 9, fill: "var(--ink-quiet)" }} tickLine={false} axisLine={false} minTickGap={42} />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 9, fill: "var(--ink-quiet)" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(value) => tooltipLabel(Number(value))} formatter={(value, name) => [`${Number(value).toFixed(0)}%`, name === "utilization" ? "GPU" : "VRAM"]} />
              <Area type="monotone" dataKey="memory" stroke={MEMORY_COLOR} fill={MEMORY_COLOR} fillOpacity={0.1} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="utilization" stroke={LOAD_COLOR} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure className="min-w-0 rounded-xl border border-line-soft bg-ink/[0.018] p-2.5" aria-label="GPU temperature and power draw over the last 24 hours">
        <figcaption className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <span className="eyebrow">Thermals + power · 24h</span>
          <span className="flex gap-3 font-mono text-mini text-ink-quiet">
            <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: TEMPERATURE_COLOR }} />°C</span>
            <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: POWER_COLOR }} />W</span>
          </span>
        </figcaption>
        <div className="h-36 w-full sm:h-40">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 144 }}>
            <ComposedChart data={points} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line-soft)" strokeDasharray="2 5" vertical={false} />
              <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={timeTick} tick={{ fontSize: 9, fill: "var(--ink-quiet)" }} tickLine={false} axisLine={false} minTickGap={42} />
              <YAxis yAxisId="temperature" domain={[0, 100]} tickFormatter={(value) => `${value}°`} tick={{ fontSize: 9, fill: "var(--ink-quiet)" }} tickLine={false} axisLine={false} width={38} />
              <YAxis yAxisId="power" orientation="right" domain={[0, "auto"]} tickFormatter={(value) => `${value}W`} tick={{ fontSize: 9, fill: "var(--ink-quiet)" }} tickLine={false} axisLine={false} width={48} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(value) => tooltipLabel(Number(value))} formatter={(value, name) => [name === "temperature" ? `${Number(value).toFixed(0)} °C` : `${Number(value).toFixed(0)} W`, name === "temperature" ? "Temperature" : "Power"]} />
              <Line yAxisId="temperature" type="monotone" dataKey="temperature" stroke={TEMPERATURE_COLOR} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
              <Area yAxisId="power" type="monotone" dataKey="power" stroke={POWER_COLOR} fill={POWER_COLOR} fillOpacity={0.1} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}

function Device({ device, history }: { device: GpuDeviceMetric; history: GpuMetricHistory[] }) {
  const points = history
    .filter((point) => point.gpu_uuid === device.gpu_uuid)
    .map((point) => ({
      time: timestampMs(point.checked_at),
      utilization: point.utilization_percent,
      memory: memoryPercent(point),
      temperature: point.temperature_c,
      power: point.power_draw_w,
    }))
    .filter((point) => !Number.isNaN(point.time));
  const vramPercent = memoryPercent(device);

  return (
    <article className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="serif text-base text-ink">{device.gpu_name}</h3>
        <span className="font-mono text-mini text-ink-quiet">GPU {device.gpu_index}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="GPU load" value={`${formatNumber(device.utilization_percent)}%`} note="current utilisation" />
        <Metric label="VRAM" value={`${formatMemory(device.memory_used_mb)} GB`} note={`${formatMemory(device.memory_total_mb)} GB total · ${formatNumber(vramPercent)}% used`} />
        <Metric label="Temperature" value={`${formatNumber(device.temperature_c)} °C`} note={device.temperature_c !== null && device.temperature_c >= 75 ? "running warm" : "current core temp"} />
        <Metric label="Power" value={`${formatNumber(device.power_draw_w, 1)} W`} note={`${formatNumber(device.power_limit_w)} W limit`} />
      </div>
      <HistoryCharts points={points} />
    </article>
  );
}

export function GpuWidget({ gpu, history }: { gpu: GpuStatus | null; history: GpuMetricHistory[] }) {
  const tone = toneFor(gpu);
  const readout = !gpu
    ? "not reported"
    : !gpu.available
      ? "unavailable"
      : isSourceStale(gpu.captured_at)
        ? `stale · ${ageLabel(gpu.captured_at)}`
        : ageLabel(gpu.captured_at);

  return (
    <Pane title="GPU" tone={tone} readout={readout}>
      {!gpu ? (
        <PaneEmpty>The cockpit agent has not reported GPU telemetry yet.</PaneEmpty>
      ) : !gpu.available ? (
        <PaneEmpty>{gpu.error || "The NVIDIA driver did not return a GPU sample."}</PaneEmpty>
      ) : gpu.devices.length === 0 ? (
        <PaneEmpty>The NVIDIA driver answered, but returned no GPU devices.</PaneEmpty>
      ) : (
        <div className="space-y-5">
          {gpu.devices.map((device) => (
            <Device key={device.gpu_uuid} device={device} history={history} />
          ))}
        </div>
      )}
    </Pane>
  );
}
