"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";

async function sessionFetcher(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not check session");
  return response.json() as Promise<{ authenticated: boolean; configured: boolean }>;
}

// Server checks protect the initial request and every API call. This removes
// already-rendered data when an open tab's session expires or is logged out.
export function SessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const { data: session, mutate } = useSWR(isLogin ? null : "/api/auth/session", sessionFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    dedupingInterval: 0,
  });
  const locked = !isLogin && session?.authenticated === false;

  useEffect(() => {
    if (locked) {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
    }
  }, [locked]);

  useEffect(() => {
    if (isLogin) return;
    const check = () => { void mutate(); };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const channel = new BroadcastChannel("cockpit-session");
    channel.addEventListener("message", check);
    window.addEventListener("pageshow", restore);
    return () => {
      channel.close();
      window.removeEventListener("pageshow", restore);
    };
  }, [isLogin, mutate]);

  return locked ? null : children;
}
