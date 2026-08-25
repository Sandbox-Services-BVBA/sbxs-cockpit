"use client";

import { useSyncExternalStore } from "react";

// Brussels time, not the viewer's. The cockpit reports on machines that all
// run on Belgian time, so a phone that has travelled must not silently shift
// every timestamp on screen.
const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  weekday: "short",
  day: "2-digit",
  month: "short",
});

// One interval for however many clocks are mounted, driven through
// useSyncExternalStore so the server render and the hydration pass agree on
// the placeholder and only the pass after that shows a time.
let snapshot = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      snapshot = Date.now();
      listeners.forEach((notify) => notify());
    }, 10_000);
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

export function CurrentTime() {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = ms === 0 ? null : new Date(ms);

  return (
    <div className="app-clock" aria-live="off">
      <strong>{now ? CLOCK.format(now) : "--:--"}</strong>
      <span>{now ? DAY.format(now) : "Brussels"}</span>
    </div>
  );
}
