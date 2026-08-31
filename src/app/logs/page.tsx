import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogsConsole } from "@/components/logs/logs-console";

export const metadata = {
  title: "Logs — SBXS Cockpit",
};

// Standalone log console. Deliberately its own route so it can be opened and
// judged on its own while the dashboard shell is being reworked elsewhere; the
// same <LogsConsole /> is what the dashboard widget opens in a modal.
export default function Page() {
  return (
    <main className="flex h-dvh flex-col gap-3 p-3 sm:p-4">
      <header className="flex shrink-0 items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1 text-tiny text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cockpit
        </Link>
        <h1 className="text-tiny font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Service Logs
        </h1>
      </header>
      <LogsConsole className="min-h-0 flex-1" />
    </main>
  );
}
