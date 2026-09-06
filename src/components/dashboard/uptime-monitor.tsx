"use client";

import { Globe } from "lucide-react";
import type { ModuleDensity } from "@/lib/layout/types";
import type { UptimeCheck } from "@/types";
import { UptimeBoard, UptimeStatusPill, type UptimeSite } from "./widgets/uptime-grid-widget";

/**
 * Uptime as a page section rather than a board tile.
 *
 * It draws the exact rows UptimeGridWidget draws, from the same module, so
 * there is one uptime row in the codebase and not two that drift apart. The
 * panel carries `@container` itself because outside the canvas there is no
 * WidgetTile to establish the query root, and the rows are written against the
 * container, not the viewport.
 *
 * Nothing currently mounts this; the canvas renders `uptime-grid` instead. It
 * is kept in step so the section is usable the moment a route wants it.
 */
export function UptimeSection({
  uptime,
  uptimeHistory,
  density = "standard",
}: {
  uptime: UptimeSite[];
  uptimeHistory: UptimeCheck[];
  density?: ModuleDensity;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Globe className="h-5 w-5" aria-hidden="true" /> Uptime
        {uptime.length > 0 && <span className="ml-auto"><UptimeStatusPill uptime={uptime} /></span>}
      </h2>

      <div className="cockpit-panel @container overflow-hidden">
        {uptime.length === 0 ? (
          <p className="px-4 py-6 text-center text-petite text-muted-foreground">
            No uptime data yet. Trigger a check at /api/uptime/check
          </p>
        ) : (
          <UptimeBoard uptime={uptime} uptimeHistory={uptimeHistory} density={density} />
        )}
      </div>
    </section>
  );
}
