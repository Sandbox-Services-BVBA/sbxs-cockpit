"use client";

import type { ReactNode } from "react";
import type { PaneTone } from "./pane";

/** Agent status strings map to the pane's four tones. */
export function toneOf(status: string): PaneTone {
  if (status === "ok") return "ok";
  if (status === "warning") return "warn";
  if (status === "critical") return "bad";
  return "idle";
}

const WORD: Record<PaneTone, string> = {
  ok: "ok",
  warn: "late",
  bad: "failed",
  idle: "unknown",
};

/**
 * One line in a list pane. The state is spelled out as a word next to the dot,
 * so the row still reads correctly with the colour removed.
 */
export function StatusRow({
  tone,
  name,
  note,
  right,
  word,
}: {
  tone: PaneTone;
  name: string;
  /** Secondary line: schedule, expected interval, failure output. */
  note?: ReactNode;
  /** Right-hand truth, normally an age. */
  right?: ReactNode;
  /** Overrides the default state word when the pane has a better one. */
  word?: string;
}) {
  return (
    <li className="status-row" data-tone={tone}>
      <span className="status-row__dot" aria-hidden="true" />
      <div className="status-row__main">
        <p className="status-row__name">{name}</p>
        {note && <p className="status-row__note">{note}</p>}
      </div>
      <div className="status-row__right">
        {right && <span className="status-row__age">{right}</span>}
        <span className="status-row__word">{word ?? WORD[tone]}</span>
      </div>
    </li>
  );
}
