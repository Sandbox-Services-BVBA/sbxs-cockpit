import type { Metadata } from "next";
import { CockpitPage } from "@/components/shell/cockpit-page";

export const metadata: Metadata = { title: "SBXS Cockpit" };

// The whole app: every module on one canvas. Analytical timeframes belong to
// their widgets and never change canvas membership.
export default function Page() {
  return <CockpitPage />;
}
