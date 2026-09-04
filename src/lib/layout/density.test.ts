import { describe, expect, it } from "vitest";
import { cutByDensity, foldLabel } from "@/components/dashboard/infra/density";
import type { ModuleDensity } from "./types";

interface Row {
  name: string;
  ok: boolean;
}

const healthy = (row: Row) => row.ok;

// Already worst-first, the way every pane sorts before cutting.
const MIXED: Row[] = [
  { name: "backup-nightly", ok: false },
  { name: "mailroom", ok: false },
  { name: "agent", ok: true },
  { name: "certbot", ok: true },
  { name: "logrotate", ok: true },
];
const ALL_OK: Row[] = MIXED.map((row) => ({ ...row, ok: true }));
const ALL_BAD: Row[] = MIXED.map((row) => ({ ...row, ok: false }));
const DENSITIES: ModuleDensity[] = ["summary", "standard", "full"];

describe("cutByDensity", () => {
  it("keeps every unhealthy row at every density", () => {
    for (const density of DENSITIES) {
      const cut = cutByDensity(MIXED, density, healthy);
      const names = cut.rows.map((row) => row.name);
      expect(names).toContain("backup-nightly");
      expect(names).toContain("mailroom");
    }
  });

  it("folds healthy rows into a count only at summary", () => {
    const summary = cutByDensity(MIXED, "summary", healthy);
    expect(summary.rows.map((row) => row.name)).toEqual(["backup-nightly", "mailroom"]);
    expect(summary.healthy).toBe(3);
    expect(summary.total).toBe(5);
    expect(summary.fold).toBe(true);

    for (const density of ["standard", "full"] as const) {
      const cut = cutByDensity(MIXED, density, healthy);
      expect(cut.rows).toEqual(MIXED);
      expect(cut.fold).toBe(false);
    }
  });

  it("preserves worst-first order in every mode", () => {
    for (const density of DENSITIES) {
      const cut = cutByDensity(MIXED, density, healthy);
      const positions = cut.rows.map((row) => MIXED.indexOf(row));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("reduces an all-healthy list at summary to the count line alone", () => {
    const cut = cutByDensity(ALL_OK, "summary", healthy);
    expect(cut.rows).toEqual([]);
    expect(cut.healthy).toBe(5);
    expect(cut.fold).toBe(true);
    expect(foldLabel(cut, "job", "on schedule")).toBe("All 5 jobs on schedule");
  });

  it("treats an all-unhealthy list at summary exactly like full", () => {
    const summary = cutByDensity(ALL_BAD, "summary", healthy);
    const full = cutByDensity(ALL_BAD, "full", healthy);
    expect(summary.rows).toEqual(full.rows);
    expect(summary.fold).toBe(false);
    expect(full.fold).toBe(false);
  });

  it("prints everything once expanded but keeps the fold so it can close", () => {
    const cut = cutByDensity(MIXED, "summary", healthy, true);
    expect(cut.rows).toEqual(MIXED);
    expect(cut.fold).toBe(true);
  });

  it("never mutates or re-sorts the input", () => {
    const copy = [...MIXED];
    cutByDensity(MIXED, "summary", healthy);
    expect(MIXED).toEqual(copy);
  });
});

describe("foldLabel", () => {
  it("counts the healthy remainder with the right plural", () => {
    expect(foldLabel({ healthy: 18, total: 21 }, "job", "on schedule")).toBe("18 jobs on schedule");
    expect(foldLabel({ healthy: 1, total: 4 }, "node", "with headroom")).toBe("1 node with headroom");
  });

  it("says All when nothing was unhealthy", () => {
    expect(foldLabel({ healthy: 9, total: 9 }, "connection", "working")).toBe(
      "All 9 connections working"
    );
  });
});
