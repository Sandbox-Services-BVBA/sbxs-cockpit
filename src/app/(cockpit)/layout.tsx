import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { LayoutProvider } from "@/lib/layout/client";

// Every cockpit domain renders inside the shell. /kitchen deliberately sits
// outside this group: the wall display gets no rail, header or bottom bar.
// The layout provider wraps the shell too, so the navigation and the views
// resolve against the same saved profile and the same edit draft.
export default function CockpitLayout({ children }: { children: ReactNode }) {
  return (
    <LayoutProvider>
      <AppShell>{children}</AppShell>
    </LayoutProvider>
  );
}
