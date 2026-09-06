import { redirect } from "next/navigation";

// The domain pages are gone: every module lives on the canvas at `/`. This
// route stays so old bookmarks and home-screen shortcuts still land.
export default function Page() {
  redirect("/");
}
