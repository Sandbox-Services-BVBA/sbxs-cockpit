import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

// Every cockpit domain renders inside the shell. /kitchen deliberately sits
// outside this group: the wall display gets no rail, header or bottom bar.
export default function CockpitLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
