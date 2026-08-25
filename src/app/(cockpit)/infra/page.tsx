import type { Metadata } from "next";
import { DomainView } from "@/components/dashboard/views/domain-view";

export const metadata: Metadata = { title: "Infrastructure — SBXS Cockpit" };

export default function Page() {
  return <DomainView category="infra" />;
}
