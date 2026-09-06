"use client";

import { HomeConsoleProvider, useHomeMode } from "@/components/dashboard/home/home-console-provider";
import { TimeframeStrip } from "@/components/dashboard/home/timeframe-strip";
import { CanvasView } from "@/components/dashboard/views/canvas-view";

/**
 * The one page. The console provider sits here rather than in the route
 * layout so the wall and the drill-downs never start the 3 second energy
 * poll; only the canvas shows Home tiles. The timeframe strip is sticky
 * under the header and global to everything below it.
 */
export function CockpitPage() {
  return (
    <HomeConsoleProvider>
      <div className="space-y-3">
        <TimeframeStrip />
        <Canvas />
      </div>
    </HomeConsoleProvider>
  );
}

// Creating the canvas element inside a component that subscribes to the mode
// is what makes a live/period switch reach it: the canvas asks
// homeModuleNode() for its tiles during render, and a parent that never
// rerenders would leave it showing period tiles in live mode. Subscribing to
// the mode alone, not the whole console, keeps the 3 second sample from
// rerendering thirty-odd unrelated tiles.
function Canvas() {
  useHomeMode();
  return <CanvasView />;
}
