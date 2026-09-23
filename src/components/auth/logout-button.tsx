"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useLayout } from "@/lib/layout/client";

export function LogoutButton() {
  const { flush } = useLayout();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const logout = async () => {
    setBusy(true);
    setError(false);
    try {
      await flush();
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      const channel = new BroadcastChannel("cockpit-session");
      channel.postMessage("logout");
      channel.close();
      window.location.replace("/login");
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return (
    <>
      {error && <span role="alert" className="text-sm text-destructive">Could not log out. Try again.</span>}
      <button type="button" className="app-icon-button" aria-label="Log out" title="Log out" disabled={busy} onClick={() => void logout()}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    </>
  );
}
