"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLayout } from "@/lib/layout/client";

// The one place a password is typed. It lives in component state for the
// length of the request and is cleared on every outcome; nothing writes it
// to storage, the URL or the profile. The server answers with a cookie the
// browser keeps for itself.
//
// It opens on the first change made without a session, and again if a
// write comes back 401. The change that triggered it is applied once the
// password is accepted; Cancel drops that change.

export function PasswordPrompt() {
  const { authPrompt } = useLayout();
  // Mounted fresh for every prompt so the field and its error start empty.
  return authPrompt ? <PasswordForm /> : null;
}

function PasswordForm() {
  const { login, dismissAuthPrompt } = useLayout();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissAuthPrompt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissAuthPrompt]);

  // The page behind the prompt is inert, so Tab past the last button would
  // otherwise fall off the page. Wrap it around inside the form instead.
  const trapTab = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("input, button:not(:disabled)")
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await login(password);
    setBusy(false);
    setPassword("");
    if (!result.ok) {
      setError(result.error);
      input.current?.focus();
    }
  };

  return (
    <div className="editor-dialog__scrim">
      <form
        className="editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-heading"
        aria-describedby="password-help"
        onSubmit={(event) => void submit(event)}
        onKeyDown={trapTab}
      >
        <h2 id="password-heading" className="serif editor-dialog__title">
          Log in to keep changes
        </h2>
        <p id="password-help" className="editor-dialog__help">
          Arranging the cockpit needs its password once per device. The session lasts 30 days.
        </p>
        <label className="editor-field editor-field--stack" htmlFor="cockpit-password">
          <span>Cockpit password</span>
          <input
            id="cockpit-password"
            ref={input}
            type="password"
            autoComplete="current-password"
            className="editor-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "password-error" : undefined}
            required
          />
        </label>
        {error && (
          <p id="password-error" className="editor-note editor-note--bad" role="alert">
            {error}
          </p>
        )}
        <div className="editor-actions">
          <button type="button" className="editor-btn" onClick={dismissAuthPrompt} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="editor-btn editor-btn--primary" disabled={busy || password.length === 0}>
            {busy ? "Checking" : "Log in"}
          </button>
        </div>
      </form>
    </div>
  );
}
