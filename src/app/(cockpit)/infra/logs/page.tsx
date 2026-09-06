import type { Metadata } from "next";
import { LogsConsole } from "@/components/logs/logs-console";
import { ViewLede } from "@/components/dashboard/views/view-chrome";

export const metadata: Metadata = { title: "Service logs — SBXS Cockpit" };

// A drill-down console, not a tile: it keeps its own route and fills the
// viewport under the header. The shell offers the way back to the canvas.
export default function Page() {
  return (
    <div className="cockpit-view flex h-[calc(100dvh-var(--header-total)-3rem)] min-h-[32rem] flex-col gap-4">
      <ViewLede>
        Every running service in one read-only console. Events collapses repeated heartbeats;
        Raw preserves the exact underlying lines.
      </ViewLede>
      <section className="pane min-h-0 flex-1 p-3 sm:p-4">
        <LogsConsole className="min-h-0 flex-1" />
      </section>
    </div>
  );
}
