"use client";

import { HomeConsoleProvider } from "@/components/dashboard/home/home-console-provider";
import { CanvasView } from "@/components/dashboard/views/canvas-view";

/**
 * The one page. The console provider sits here rather than in the route
 * layout so the wall and the drill-downs never start the 3 second energy
 * poll. Analytical ranges are chosen inside the individual tile settings.
 */
export function CockpitPage() {
  return (
    <HomeConsoleProvider>
      <CanvasView />
    </HomeConsoleProvider>
  );
}
