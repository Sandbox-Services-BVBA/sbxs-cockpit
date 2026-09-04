"use client";

import { useLayout } from "@/lib/layout/client";
import type { ViewId } from "@/lib/layout/types";
import { cn } from "@/lib/utils";
import { EditorActions, EditorNotes } from "./editor-actions";

// The strip the shell header grows while editing: Modules/Sections switch on
// the left, Save/Cancel/Reset on the right, and any note that explains why
// Save is refusing underneath. The same actions repeat at the foot of the
// editor so a long list never leaves them out of reach.

export function EditorBar({ viewId }: { viewId: ViewId }) {
  const { editorTab, setEditorTab } = useLayout();

  return (
    <div className="editor-bar" role="region" aria-label="Layout editor">
      <div className="editor-bar__row">
        <div className="editor-tabs" role="group" aria-label="What to customize">
          <button
            type="button"
            className={cn("editor-tab", editorTab === "modules" && "is-active")}
            aria-pressed={editorTab === "modules"}
            onClick={() => setEditorTab("modules")}
          >
            Modules
          </button>
          <button
            type="button"
            className={cn("editor-tab", editorTab === "sections" && "is-active")}
            aria-pressed={editorTab === "sections"}
            onClick={() => setEditorTab("sections")}
          >
            Sections
          </button>
        </div>
        <EditorActions viewId={viewId} />
      </div>
      <EditorNotes />
    </div>
  );
}
