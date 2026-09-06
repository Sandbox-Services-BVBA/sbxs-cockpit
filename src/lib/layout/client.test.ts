import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave, moveAmongVisible, moveId, placeBefore } from "./client";

describe("moveId", () => {
  it("moves an item up and down", () => {
    expect(moveId(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
  });

  it("returns the list unchanged at the edges or for an unknown id", () => {
    const list = ["a", "b", "c"];
    expect(moveId(list, "a", -1)).toBe(list);
    expect(moveId(list, "c", 1)).toBe(list);
    expect(moveId(list, "zz", 1)).toBe(list);
  });
});

describe("placeBefore", () => {
  it("puts an item in front of another and keeps the rest in order", () => {
    expect(placeBefore(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(placeBefore(["a", "b", "c", "d"], "a", "d")).toEqual(["b", "c", "a", "d"]);
  });

  it("puts an item last for a null target", () => {
    expect(placeBefore(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
  });

  it("returns the same list when nothing changes or an id is unknown", () => {
    const list = ["a", "b", "c"];
    expect(placeBefore(list, "a", "b")).toBe(list);
    expect(placeBefore(list, "c", null)).toBe(list);
    expect(placeBefore(list, "zz", "a")).toBe(list);
    expect(placeBefore(list, "a", "zz")).toBe(list);
    expect(placeBefore(list, "a", "a")).toBe(list);
  });
});

describe("moveAmongVisible", () => {
  // h1 and h2 are hidden: they sit in the order but are not on screen.
  const full = ["a", "h1", "b", "c", "h2", "d"];
  const visible = ["a", "b", "c", "d"];

  it("skips hidden entries so a move is always visible", () => {
    expect(moveAmongVisible(full, visible, "b", -1)).toEqual(["b", "a", "h1", "c", "h2", "d"]);
    expect(moveAmongVisible(full, visible, "c", 1)).toEqual(["a", "h1", "b", "h2", "d", "c"]);
  });

  it("keeps hidden entries in their relative slots", () => {
    const next = moveAmongVisible(full, visible, "d", -1);
    expect(next.filter((id) => id.startsWith("h"))).toEqual(["h1", "h2"]);
    expect(next.filter((id) => !id.startsWith("h"))).toEqual(["a", "b", "d", "c"]);
  });

  it("returns the same list at either end", () => {
    expect(moveAmongVisible(full, visible, "a", -1)).toBe(full);
    expect(moveAmongVisible(full, visible, "d", 1)).toBe(full);
    expect(moveAmongVisible(full, visible, "h1", 1)).toBe(full);
  });
});

describe("createAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid changes into one write with the last value", async () => {
    const write = vi.fn(() => Promise.resolve());
    const autosave = createAutosave<number>(write, 800);
    autosave.schedule(1);
    await vi.advanceTimersByTimeAsync(300);
    autosave.schedule(2);
    await vi.advanceTimersByTimeAsync(300);
    autosave.schedule(3);
    expect(write).not.toHaveBeenCalled();
    expect(autosave.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(3);
    expect(autosave.pending).toBe(false);
  });

  it("writes a value that arrives mid-flight after the first write, once", async () => {
    let release: () => void = () => {};
    const write = vi.fn(
      (value: number) =>
        new Promise<void>((resolve) => {
          if (value === 1) release = resolve;
          else resolve();
        })
    );
    const autosave = createAutosave<number>(write, 100);
    autosave.schedule(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(1);
    autosave.schedule(2);
    autosave.schedule(3);
    await vi.advanceTimersByTimeAsync(100);
    // Still one call: the first write has not resolved yet.
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(3);
  });

  it("flush writes immediately and cancel drops the value", async () => {
    const write = vi.fn(() => Promise.resolve());
    const autosave = createAutosave<string>(write, 800);
    autosave.schedule("now");
    await autosave.flush();
    expect(write).toHaveBeenCalledWith("now");

    autosave.schedule("never");
    autosave.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(autosave.pending).toBe(false);
  });

  it("swallows a failed write so the queue keeps moving", async () => {
    const write = vi.fn((value: number) => (value === 1 ? Promise.reject(new Error("no")) : Promise.resolve()));
    const autosave = createAutosave<number>(write, 10);
    autosave.schedule(1);
    await vi.advanceTimersByTimeAsync(10);
    autosave.schedule(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
