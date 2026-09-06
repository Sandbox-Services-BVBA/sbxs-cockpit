"use client";

import { useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import type { ResolvedModule } from "@/lib/layout/types";
import { useLayout } from "@/lib/layout/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { moduleNote } from "./module-notes";

// The + button and the tray behind it: every closed widget, one Add each.
// The tray is the only way back for a closed tile, so it also carries the
// reset to defaults that used to live on the editor's footer.

interface AddTrayProps {
  hidden: ResolvedModule[];
  onAdd: (moduleId: string) => void;
}

export function AddTray({ hidden, onAdd }: AddTrayProps) {
  const { resetAll } = useLayout();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const count = hidden.length;

  const add = (moduleId: string) => {
    onAdd(moduleId);
    setOpen(false);
  };

  const reset = async () => {
    setResetting(true);
    const ok = await resetAll();
    setResetting(false);
    setConfirmReset(false);
    if (ok) setOpen(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmReset(false);
      }}
    >
      <SheetTrigger className="canvas-add" aria-label={count ? `Add a widget (${count} closed)` : "Add a widget"}>
        <Plus aria-hidden="true" />
        <span className="canvas-add__label">Add</span>
        {count > 0 && <span className="canvas-add__count">{count}</span>}
      </SheetTrigger>
      <SheetContent side="right" className="canvas-tray">
        <SheetHeader>
          <SheetTitle className="serif canvas-tray__title">Add a widget</SheetTitle>
          <SheetDescription className="canvas-tray__lede">
            {count === 0
              ? "Everything is on the page. Close a widget with its X and it will be listed here."
              : `${count} closed ${count === 1 ? "widget" : "widgets"}. Add one and the page scrolls to it.`}
          </SheetDescription>
        </SheetHeader>

        {count > 0 && (
          <ul className="canvas-tray__list">
            {hidden.map((entry) => (
              <li key={entry.moduleId} className="canvas-tray__item">
                <div className="canvas-tray__text">
                  <p className="canvas-tray__name">{entry.definition.title}</p>
                  <p className="canvas-tray__note">{moduleNote(entry.definition)}</p>
                </div>
                <button type="button" className="editor-btn editor-btn--small" onClick={() => add(entry.moduleId)}>
                  <Plus aria-hidden="true" />
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="canvas-tray__foot">
          {confirmReset ? (
            <div className="canvas-tray__confirm" role="group" aria-label="Confirm reset">
              <p className="canvas-tray__note">
                Every widget back, in the default order and width. This cannot be undone.
              </p>
              <div className="editor-actions">
                <button type="button" className="editor-btn editor-btn--small" onClick={() => setConfirmReset(false)} disabled={resetting}>
                  Keep my layout
                </button>
                <button type="button" className="editor-btn editor-btn--small editor-btn--danger" onClick={() => void reset()} disabled={resetting}>
                  {resetting ? "Resetting" : "Reset everything"}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="editor-link canvas-tray__reset" onClick={() => setConfirmReset(true)}>
              <RotateCcw aria-hidden="true" />
              Reset the whole page to defaults
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
