import { redirect } from "next/navigation";

// The energy console now lives inside the dashboard's Home view. This route is
// kept only so old bookmarks and the installed PWA land in the right place.
export default function Page() {
  redirect("/");
}
