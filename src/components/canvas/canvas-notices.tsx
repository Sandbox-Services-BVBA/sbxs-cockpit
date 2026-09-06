"use client";

import { useEffect } from "react";
import { Check, CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { useLayout } from "@/lib/layout/client";

// The small things the canvas says while it works: the polite live region
// for keyboard moves, the undo toast after a close, and a status pill for
// the autosave when it has something to report. Silence is the default.

export function LiveRegion({ text }: { text: string }) {
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}

export interface UndoToastState {
  moduleId: string;
  title: string;
}

/** Closing is one click now and there is no Cancel, so a close can be undone for a moment. */
export function UndoToast({
  toast,
  onUndo,
  onDismiss,
  ttl = 7000,
}: {
  toast: UndoToastState | null;
  onUndo: (moduleId: string) => void;
  onDismiss: () => void;
  ttl?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, ttl);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, ttl]);

  if (!toast) return null;
  return (
    <div className="canvas-toast" role="status">
      <span className="canvas-toast__text">Closed {toast.title}</span>
      <button type="button" className="canvas-toast__undo" onClick={() => onUndo(toast.moduleId)}>
        Undo
      </button>
    </div>
  );
}

/**
 * Shown only while there is something to say. "Saving" and "Saved" are
 * brief; the refused states stay until the next successful write, and the
 * unauthorized one carries a Log in button so the fix is one click away.
 */
export function SaveStatus() {
  const { saveState, saveError, pending, refreshAuth, flush } = useLayout();

  if (saveState === "idle" && !pending) return null;

  if (saveState === "saving" || (saveState === "idle" && pending)) {
    return (
      <div className="canvas-status" role="status">
        <LoaderCircle className="canvas-status__spin" aria-hidden="true" />
        Saving
      </div>
    );
  }
  if (saveState === "saved") {
    return (
      <div className="canvas-status canvas-status--ok" role="status">
        <Check aria-hidden="true" />
        Saved
      </div>
    );
  }
  if (saveState === "unauthorized") {
    return (
      <div className="canvas-status canvas-status--bad" role="alert">
        <CloudOff aria-hidden="true" />
        <span>{saveError}</span>
        <button
          type="button"
          className="canvas-status__action"
          onClick={() => {
            // A fresh session check first: the cookie may have come back on
            // another tab. Then retry, which prompts if it has not.
            refreshAuth();
            void flush();
          }}
        >
          Log in
        </button>
      </div>
    );
  }
  return (
    <div
      className={saveState === "conflict" ? "canvas-status canvas-status--warn" : "canvas-status canvas-status--bad"}
      role="alert"
    >
      <TriangleAlert aria-hidden="true" />
      <span>{saveError}</span>
    </div>
  );
}
