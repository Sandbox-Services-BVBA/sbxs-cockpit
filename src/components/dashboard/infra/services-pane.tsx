"use client";

import { useSyncExternalStore } from "react";
import { ago } from "@/lib/connection-state";
import type { Service } from "@/types";
import { Pane, PaneEmpty } from "./pane";
import { StatusRow } from "./status-row";

// A shared 5 second tick so every heartbeat age on the pane advances together
// without each row owning an interval.
let snapshot = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      snapshot = Date.now();
      listeners.forEach((notify) => notify());
    }, 5_000);
  }
  snapshot = Date.now();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => 0;

function uptimeLabel(seconds: number): string {
  if (!seconds || seconds < 0) return "running";
  if (seconds < 60) return `up ${seconds}s`;
  if (seconds < 3600) return `up ${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `up ${Math.floor(seconds / 3600)}h`;
  return `up ${Math.floor(seconds / 86400)}d`;
}

export function ServicesPane({ services }: { services: Service[] | null | undefined }) {
  // Read purely so the heartbeat ages recompute on the tick.
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!services) {
    return (
      <Pane title="Services" readout="no report">
        <PaneEmpty>The agent has not reported the service list on this run.</PaneEmpty>
      </Pane>
    );
  }

  if (services.length === 0) {
    return (
      <Pane title="Services" readout="none tracked">
        <PaneEmpty>The agent reported an empty service list.</PaneEmpty>
      </Pane>
    );
  }

  // Down first, then alphabetical.
  const sorted = [...services].sort(
    (a, b) => Number(!!a.running) - Number(!!b.running) || a.name.localeCompare(b.name)
  );
  const down = services.filter((service) => !service.running).length;

  return (
    <Pane
      title="Services"
      tone={down > 0 ? "bad" : "ok"}
      readout={down > 0 ? `${down} of ${services.length} down` : `${services.length} up`}
    >
      <ul className="status-list">
        {sorted.map((service) => {
          const running = !!service.running;
          const beat = ago(service.last_beat);
          const note = running
            ? [uptimeLabel(service.uptime_seconds), service.detail].filter(Boolean).join(" · ")
            : service.detail ?? "not running";
          return (
            <StatusRow
              key={service.name}
              tone={running ? "ok" : "bad"}
              name={service.name}
              note={note}
              // Only a real heartbeat earns the right-hand slot. Repeating the
              // uptime there next to the word UP says the same thing twice.
              right={running && beat ? `beat ${beat}` : undefined}
              word={running ? "up" : "down"}
            />
          );
        })}
      </ul>
    </Pane>
  );
}
