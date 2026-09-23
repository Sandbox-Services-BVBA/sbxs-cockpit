import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { safeReturnTo } from "@/lib/login-redirect";
import { hasValidSession, isAuthConfigured } from "@/lib/session";

export const metadata = { title: "Log in | SBXS Cockpit" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const returnTo = safeReturnTo((await searchParams).next);
  const request = new Request("https://cockpit.invalid/login", { headers: await headers() });
  if (hasValidSession(request)) redirect(returnTo);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12 [--domain-accent:var(--teal)]">
      <section className="w-full max-w-sm rounded-2xl border border-line bg-pane p-8 shadow-sm" aria-labelledby="login-heading">
        <p className="eyebrow mb-6 text-teal">SBXS Cockpit</p>
        <h1 id="login-heading" className="serif text-3xl text-ink">Log in to the cockpit</h1>
        <p id="login-help" className="mt-3 mb-7 text-sm leading-relaxed text-ink-muted">
          Enter your password to view the dashboard and keep changes. You stay logged in for 30 days on this device.
        </p>
        <LoginForm configured={isAuthConfigured()} returnTo={returnTo} />
      </section>
    </main>
  );
}
