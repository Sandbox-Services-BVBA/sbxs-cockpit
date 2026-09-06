"use client";

import type { ReactNode } from "react";

/** How a pane's own contents are doing. Drives the status word, never colour alone. */
export type PaneTone = "ok" | "warn" | "bad" | "idle";

/**
 * A pane in the converted visual language: serif title, mono readout, a hairline
 * accent tick. It is the tile the Infrastructure modules draw inside, the way
 * WidgetTile is the tile everything else draws inside, so it obeys the same two
 * canvas rules: it fills the box it is given rather than growing to fit its
 * contents, and the body scrolls on its own. A pane that sized itself would
 * tear the board apart every time a list got longer.
 *
 * `@container` makes the pane the query root, because nothing above it is one:
 * the placement frame owns width and order, and a pane can be three columns
 * wide or twenty. The utilities sit alongside the `pane` classes rather than
 * replacing them; they only add properties globals.css leaves unset.
 */
export function Pane({
  title,
  readout,
  tone = "idle",
  children,
}: {
  title: string;
  /** Short right-aligned truth, e.g. "3 nodes" or "0/9 working". */
  readout?: ReactNode;
  tone?: PaneTone;
  children: ReactNode;
}) {
  return (
    <section className="pane @container h-full min-h-0 overflow-hidden" data-tone={tone}>
      <header className="pane__head shrink-0">
        <h2 className="serif pane__title">{title}</h2>
        {readout !== undefined && <span className="pane__readout">{readout}</span>}
      </header>
      <div className="pane__body min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
    </section>
  );
}

/** The honest empty state: names what is missing rather than showing a zero. */
export function PaneEmpty({ children }: { children: ReactNode }) {
  return <p className="pane__empty">{children}</p>;
}
