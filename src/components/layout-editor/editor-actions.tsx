"use client";

import { useLayout } from "@/lib/layout/client";
import type { ViewId } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

// The three buttons every edit surface ends with, plus the notes that explain
// why Save may be refusing. Shared between the header bar and the editor
// footer so a phone user does not have to scroll back up to save.

/** Views whose modules render through DomainView and therefore edit in place. */
export const EDITABLE_VIEWS: ReadonlySet<ViewId> = new Set<ViewId>([
  "sites",
  "money",
  "comms",
  "dev",
  "personal",
]);

export function EditorActions({ viewId, className }: { viewId: ViewId; className?: string }) {
  const { saveWithAuth, cancel, resetView, dirty, saveState, draftProblem, authConfigured } =
    useLayout();
  const saving = saveState === "saving";
  const blocked = !!draftProblem || (dirty && !authConfigured);

  return (
    <div className={cn("editor-actions", className)}>
      {EDITABLE_VIEWS.has(viewId) && (
        <button type="button" className="editor-btn" onClick={() => resetView(viewId)}>
          Reset this view
        </button>
      )}
      <button type="button" className="editor-btn" onClick={cancel} disabled={saving}>
        Cancel
      </button>
      <button
        type="button"
        className="editor-btn editor-btn--primary"
        onClick={() => void saveWithAuth()}
        disabled={saving || blocked}
        aria-disabled={blocked || undefined}
      >
        {saving ? "Saving" : dirty ? "Save" : "Done"}
      </button>
    </div>
  );
}

export function EditorNotes() {
  const { authConfigured, saveError, saveState, draftProblem, dirty } = useLayout();
  const notes: { tone: "warn" | "bad" | "info"; text: string }[] = [];

  if (!authConfigured) {
    notes.push({
      tone: "warn",
      text: "Saving is disabled: COCKPIT_PASSWORD is not set on the server. You can preview changes here; Cancel discards them.",
    });
  }
  if (draftProblem) notes.push({ tone: "bad", text: draftProblem });
  if (saveError) notes.push({ tone: saveState === "conflict" ? "info" : "bad", text: saveError });
  if (saveState === "unauthorized" && authConfigured && dirty) {
    notes.push({ tone: "info", text: "Log in to save this layout." });
  }
  if (notes.length === 0) return null;

  return (
    <div className="editor-notes" role="status">
      {notes.map((note) => (
        <p key={note.text} className={`editor-note editor-note--${note.tone}`}>
          {note.text}
        </p>
      ))}
    </div>
  );
}
