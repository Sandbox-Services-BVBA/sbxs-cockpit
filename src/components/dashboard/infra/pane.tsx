"use client";

import type { ReactNode } from "react";

/** How a pane's own contents are doing. Drives the status word, never colour alone. */
export type PaneTone = "ok" | "warn" | "bad" | "idle";

/**
 * A pane in the converted visual language: serif title, mono readout, a hairline
 * accent tick, and a body that is exactly as tall as its content. Nothing here
 * forces a uniform card height, and nothing here decides width or order: the
 * placement frame owns both, the pane owns content only.
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
    <section className="pane" data-tone={tone}>
      <header className="pane__head">
        <h2 className="serif pane__title">{title}</h2>
        {readout !== undefined && <span className="pane__readout">{readout}</span>}
      </header>
      <div className="pane__body">{children}</div>
    </section>
  );
}

/** The honest empty state: names what is missing rather than showing a zero. */
export function PaneEmpty({ children }: { children: ReactNode }) {
  return <p className="pane__empty">{children}</p>;
}
