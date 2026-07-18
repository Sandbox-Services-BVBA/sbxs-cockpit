import { KitchenDisplay } from "@/components/energy/kitchen-display";

export const metadata = {
  title: "Keuken — SBXS Cockpit",
};

// Always-on wall display (Raspberry Pi kiosk). Deliberately outside the
// dashboard shell: no rail, no header, no timeframe switcher.
export default function Page() {
  return <KitchenDisplay />;
}
