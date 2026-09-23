"use client";

import { useRef, useState, type FormEvent } from "react";

export function LoginForm({ configured, returnTo }: { configured: boolean; returnTo: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (!configured) {
    return <p role="alert" className="editor-note editor-note--bad">Login is unavailable until the cockpit password is configured.</p>;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      if (response.ok) {
        // A full navigation starts a fresh authenticated tree and drops any
        // old client-side dashboard data from a previous session.
        window.location.replace(returnTo);
        return;
      }
      setError(response.status === 429
        ? "Too many attempts. Wait 15 minutes and try again."
        : "That password was not accepted.");
    } catch {
      setPassword("");
      setError("Could not connect. Please try again.");
    }
    setBusy(false);
    input.current?.focus();
  };

  return (
    <form onSubmit={(event) => void submit(event)} aria-describedby="login-help">
      <label className="editor-field editor-field--stack" htmlFor="cockpit-password">
        <span>Cockpit password</span>
        <input
          id="cockpit-password"
          name="password"
          ref={input}
          type="password"
          autoComplete="current-password"
          autoFocus
          className="editor-input min-h-11! text-base!"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "password-error" : undefined}
          required
        />
      </label>
      {error && <p id="password-error" className="editor-note editor-note--bad mt-3" role="alert">{error}</p>}
      <button type="submit" className="editor-btn editor-btn--primary mt-6 min-h-11! w-full justify-center" disabled={busy || password.length === 0}>
        {busy ? "Checking" : "Log in"}
      </button>
    </form>
  );
}
