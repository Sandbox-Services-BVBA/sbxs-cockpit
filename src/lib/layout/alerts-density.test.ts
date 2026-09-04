import { describe, expect, it } from "vitest";
import { cutAlerts } from "@/lib/alerts-density";
import type { ModuleDensity } from "@/lib/layout/types";
import type { Alert } from "@/types";

function alert(id: number, severity: Alert["severity"], source = `s${id}`): Alert {
  return {
    id,
    severity,
    category: "test",
    source,
    message: `m${id}`,
    resolved: false,
    notified: false,
    last_notified_at: null,
    created_at: "2026-09-04T06:00:00Z",
    resolved_at: null,
  };
}

const DENSITIES: ModuleDensity[] = ["summary", "standard", "full"];
// Warnings first on purpose: the cut must put criticals ahead regardless.
const MIXED = [alert(1, "warning"), alert(2, "critical"), alert(3, "warning"), alert(4, "critical")];

describe("cutAlerts", () => {
  it("prints every critical at every density, in input order, ahead of warnings", () => {
    for (const density of DENSITIES) {
      const cut = cutAlerts(MIXED, density);
      expect(cut.criticals.map((a) => a.id), density).toEqual([2, 4]);
      // The critical rows are never part of what the fold can hide.
      expect(cut.rows.filter((a) => a.severity === "critical").map((a) => a.id), density).toEqual([2, 4]);
    }
  });

  it("summary folds the warnings into a count and shows them again on demand", () => {
    const folded = cutAlerts(MIXED, "summary");
    expect(folded.fold).toBe(true);
    expect(folded.healthy).toBe(2);
    expect(folded.total).toBe(4);
    expect(folded.warnings).toEqual([]);

    const expanded = cutAlerts(MIXED, "summary", true);
    expect(expanded.fold).toBe(true);
    expect(expanded.warnings.map((a) => a.id)).toEqual([1, 3]);
    expect(expanded.itemized).toBe(true);
  });

  it("standard keeps today's grouped warning line and never folds", () => {
    const cut = cutAlerts(MIXED, "standard");
    expect(cut.fold).toBe(false);
    expect(cut.itemized).toBe(false);
    expect(cut.warnings.map((a) => a.id)).toEqual([1, 3]);
  });

  it("full itemizes every warning and never folds", () => {
    const cut = cutAlerts(MIXED, "full");
    expect(cut.fold).toBe(false);
    expect(cut.itemized).toBe(true);
    expect(cut.warnings.map((a) => a.id)).toEqual([1, 3]);
  });

  it("has nothing to fold when every alert is critical", () => {
    const cut = cutAlerts([alert(1, "critical"), alert(2, "critical")], "summary");
    expect(cut.fold).toBe(false);
    expect(cut.criticals).toHaveLength(2);
  });
});
