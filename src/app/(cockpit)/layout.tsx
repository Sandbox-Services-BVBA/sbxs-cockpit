import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { LayoutProvider } from "@/lib/layout/client";

// The canvas, the wall and the two drill-down consoles render inside the
// shell. /kitchen deliberately sits outside this group: the kitchen display
// gets no header at all. The layout provider wraps the shell too, so the
// header and the canvas resolve against the same saved profile.
export default function CockpitLayout({ children }: { children: ReactNode }) {
  return (
    <LayoutProvider>
      <AppShell>{children}</AppShell>
    </LayoutProvider>
  );
}
