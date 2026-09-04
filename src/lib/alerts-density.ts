// What the alert queue prints at a given density.
//
// The one rule: a critical alert is on screen at every density. It is the
// unhealthy row for cutByDensity, so it can never be folded, and it is always
// printed first. Density only decides what happens to the warnings:
//   summary  - criticals in full, warnings folded into a count with Show all
//   standard - criticals in full, warnings grouped into one line (today's UI)
//   full     - every alert as its own row, warnings included

import { cutByDensity, type DensityCut } from "@/components/dashboard/infra/density";
import type { ModuleDensity } from "@/lib/layout/types";
import type { Alert } from "@/types";

export interface AlertCut extends DensityCut<Alert> {
  criticals: Alert[];
  /** Warnings that should be printed, whether as rows or as one grouped line. */
  warnings: Alert[];
  /** True when each warning gets its own row rather than the grouped line. */
  itemized: boolean;
}

export const isCritical = (alert: Alert): boolean => alert.severity === "critical";

export function cutAlerts(alerts: Alert[], density: ModuleDensity, expanded = false): AlertCut {
  const criticals = alerts.filter(isCritical);
  const rest = alerts.filter((alert) => !isCritical(alert));
  const cut = cutByDensity([...criticals, ...rest], density, (alert) => !isCritical(alert), expanded);
  return {
    ...cut,
    criticals,
    warnings: cut.rows.filter((alert) => !isCritical(alert)),
    itemized: density !== "standard",
  };
}
