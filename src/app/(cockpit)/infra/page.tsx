import type { Metadata } from "next";
import { InfraView } from "@/components/dashboard/views/infra-view";

export const metadata: Metadata = { title: "Infrastructure — SBXS Cockpit" };

export default function Page() {
  return <InfraView />;
}
