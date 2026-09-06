import { describe, expect, it } from "vitest";
import { MODULE_CATALOG } from "./catalog";
import { DEFAULT_LAYOUTS } from "./default-layouts";

// The canvas is the whole app, so a module missing from it is invisible with
// no navigation left to reach it by. This is the test that catches that.
describe("canvas coverage", () => {
  it("places every catalogued module exactly once", () => {
    const placed = DEFAULT_LAYOUTS.canvas.map((p) => p.moduleId);
    const catalogued = MODULE_CATALOG.map((m) => m.id);
    expect([...placed].sort()).toEqual([...catalogued].sort());
  });
});
