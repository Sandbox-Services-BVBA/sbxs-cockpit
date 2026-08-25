import type { Metadata } from "next";
import { HouseConsole } from "@/components/dashboard/house-console";

export const metadata: Metadata = { title: "Home — SBXS Cockpit" };

// The view Bob lives in: the full house console, energy through office control.
export default function Page() {
  return <HouseConsole />;
}
