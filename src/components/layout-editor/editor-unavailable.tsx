"use client";

import Link from "next/link";
import { useLayout } from "@/lib/layout/client";
import type { ViewMeta } from "@/lib/views";
import { EDITABLE_VIEWS } from "./editor-actions";

// Shown in place of a page that has no module editor yet: Home, Attention and
// Infrastructure still render their own panes (later phases), and the log
// consoles under a domain are tools rather than layouts. The Sections tab
// works everywhere, so this points there instead of leaving a blank page.

export function EditorUnavailable({ view, drillDown }: { view: ViewMeta; drillDown: boolean }) {
  const { setEditorTab, cancel } = useLayout();

  return (
    <div className="cockpit-view">
      <section className="editor editor--note" aria-labelledby="editor-unavailable-heading">
        <h2 id="editor-unavailable-heading" className="serif editor__title">
          Nothing to customize here yet
        </h2>
        <p className="editor__lede">
          {drillDown
            ? `This page is a drill-down tool inside ${view.label}, not a module layout.`
            : `${view.label} still renders its own panes; its modules join the layout editor in a later phase.`}{" "}
          You can change the navigation under Sections, {drillDown && EDITABLE_VIEWS.has(view.id) ? (
            <>
              customize the <Link href={view.href} className="editor-link">{view.label} overview</Link>,{" "}
            </>
          ) : null}
          or cancel.
        </p>
        <div className="editor-actions">
          <button type="button" className="editor-btn" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="editor-btn editor-btn--primary" onClick={() => setEditorTab("sections")}>
            Open Sections
          </button>
        </div>
      </section>
    </div>
  );
}
