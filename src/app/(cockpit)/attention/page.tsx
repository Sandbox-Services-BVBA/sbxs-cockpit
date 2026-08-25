import type { Metadata } from "next";
import { AttentionView } from "@/components/dashboard/views/attention-view";

export const metadata: Metadata = { title: "Attention — SBXS Cockpit" };

export default function Page() {
  return <AttentionView />;
}
