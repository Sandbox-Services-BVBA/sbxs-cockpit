import type { Metadata } from "next";
import { WallView } from "@/components/dashboard/views/wall-view";

export const metadata: Metadata = { title: "Wallboard — SBXS Cockpit" };

export default function Page() {
  return <WallView />;
}
