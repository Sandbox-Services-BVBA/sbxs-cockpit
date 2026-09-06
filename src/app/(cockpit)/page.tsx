import type { Metadata } from "next";
import { CockpitPage } from "@/components/shell/cockpit-page";

export const metadata: Metadata = { title: "SBXS Cockpit" };

// The whole app: every module on one canvas, with the timeframe above it.
export default function Page() {
  return <CockpitPage />;
}
