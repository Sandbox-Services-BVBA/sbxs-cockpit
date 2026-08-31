import { redirect } from "next/navigation";

// Kept for bookmarks from the standalone feature build. The console now lives
// inside Cockpit's Infrastructure domain and therefore gets the shared shell.
export default function Page() {
  redirect("/infra/logs");
}
