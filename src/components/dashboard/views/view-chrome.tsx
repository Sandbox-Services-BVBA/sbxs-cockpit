"use client";

import type { ReactNode } from "react";
import { RadioTower } from "lucide-react";

/**
 * The one-line lede under the shell header. The shell already names the view,
 * so this says what the view is for and nothing else.
 */
export function ViewLede({ children }: { children: ReactNode }) {
  return <p className="view-lede">{children}</p>;
}

export function ViewError({ message }: { message: string }) {
  return (
    <div role="alert" className="view-note view-note--bad">
      <b>Dashboard request failed.</b> {message}
    </div>
  );
}

export function ViewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6" aria-label="Loading">
      <div className="h-64 animate-pulse rounded-2xl bg-muted md:col-span-2 xl:col-span-2" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-48 animate-pulse rounded-2xl bg-muted xl:col-span-1" />
      ))}
    </div>
  );
}

/**
 * Shown whenever a collector is outside its reliability window. The values
 * underneath stay on screen for context; this is what stops them reading as
 * current.
 */
export function SourceFreshnessNotice({
  agentStale,
  uptimeStale,
}: {
  agentStale: boolean;
  uptimeStale: boolean;
}) {
  if (!agentStale && !uptimeStale) return null;

  return (
    <div className="view-note view-note--bad">
      <span className="view-note__icon">
        <RadioTower className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <b>Live telemetry is not trustworthy</b>
        <p>
          {agentStale
            ? "The cockpit agent has not delivered data inside its 15 minute window. Values below are retained for context, not presented as current."
            : "The uptime feed is outside its 20 minute window. Site availability may be out of date."}
        </p>
      </div>
    </div>
  );
}
