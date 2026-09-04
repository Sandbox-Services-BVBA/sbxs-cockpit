// What a list module prints at a given density.
//
// Pure so it runs in a unit test, and shared by every list pane and widget so
// the one rule that matters lives in exactly one place: an unhealthy row is
// never collapsed, hidden or summarised, at any density. Summary only folds
// the healthy remainder into a count; Standard and Full print every row.
// Rows come in already sorted worst-first and leave in the same order.

import type { ModuleDensity } from "@/lib/layout/types";

export interface DensityCut<T> {
  /** Rows to print, in the order they came in. */
  rows: T[];
  total: number;
  /** Healthy rows in the input, whether or not they are printed. */
  healthy: number;
  /** True when the module should draw the count line and its Show all control. */
  fold: boolean;
}

export function cutByDensity<T>(
  rows: T[],
  density: ModuleDensity,
  isHealthy: (row: T) => boolean,
  expanded = false
): DensityCut<T> {
  const healthy = rows.filter(isHealthy).length;
  // The fold is a summary-only affordance, and only worth drawing when there
  // is something behind it. It stays while expanded so it can be closed again.
  const fold = density === "summary" && healthy > 0;
  if (!fold || expanded) return { rows, total: rows.length, healthy, fold };
  return { rows: rows.filter((row) => !isHealthy(row)), total: rows.length, healthy, fold };
}

/** "18 jobs on schedule", or "All 21 jobs on schedule" when nothing is wrong. */
export function foldLabel(cut: { healthy: number; total: number }, noun: string, state: string): string {
  const word = cut.healthy === 1 ? noun : `${noun}s`;
  const all = cut.healthy === cut.total ? "All " : "";
  return `${all}${cut.healthy} ${word} ${state}`;
}
