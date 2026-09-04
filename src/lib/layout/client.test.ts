import { describe, expect, it } from "vitest";
import { draftPins, moveId, orderedDomains, pinProblem } from "./client";
import { DEFAULT_DOMAIN_ORDER, DEFAULT_MOBILE_PINS } from "./default-layouts";
import { LAYOUT_SCHEMA_VERSION, MOBILE_PIN_COUNT, type LayoutProfile } from "./types";

function profile(partial: Partial<LayoutProfile>): LayoutProfile {
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, revision: 1, ...partial };
}

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

describe("orderedDomains", () => {
  it("is the default order without overrides, hidden domains included", () => {
    expect(orderedDomains(profile({}))).toEqual(DEFAULT_DOMAIN_ORDER);
    expect(orderedDomains(profile({ domains: { alerts: { visible: false } } }))).toEqual(DEFAULT_DOMAIN_ORDER);
  });

  it("follows a saved order and keeps the rest in default slots", () => {
    const order = orderedDomains(profile({ domains: { sites: { order: 0 }, house: { order: 5 } } }));
    expect(order[0]).toBe("sites");
    expect(order.indexOf("house")).toBeGreaterThan(order.indexOf("infra"));
    expect(order).toHaveLength(DEFAULT_DOMAIN_ORDER.length);
  });
});

describe("draftPins and pinProblem", () => {
  it("shows the effective defaults and no problem when pins were never saved", () => {
    expect(draftPins(profile({}))).toEqual(DEFAULT_MOBILE_PINS);
    expect(pinProblem(profile({}))).toBeNull();
  });

  it("shows the raw saved set even when it is the wrong size, and names the problem", () => {
    const three = profile({
      domains: { house: { mobilePinned: true }, sites: { mobilePinned: true }, dev: { mobilePinned: true } },
    });
    expect(draftPins(three)).toEqual(["house", "sites", "dev"]);
    expect(pinProblem(three)).toContain(`exactly ${MOBILE_PIN_COUNT}`);

    const five = profile({
      domains: {
        house: { mobilePinned: true },
        alerts: { mobilePinned: true },
        infra: { mobilePinned: true },
        sites: { mobilePinned: true },
        dev: { mobilePinned: true },
      },
    });
    expect(draftPins(five)).toHaveLength(5);
    expect(pinProblem(five)).toContain("5 are pinned");
  });

  it("accepts exactly four visible pins and rejects a hidden one", () => {
    const good = profile({
      domains: {
        house: { mobilePinned: true },
        alerts: { mobilePinned: true },
        infra: { mobilePinned: true },
        sites: { mobilePinned: true },
        money: { mobilePinned: false },
      },
    });
    expect(pinProblem(good)).toBeNull();

    const hidden = profile({
      domains: {
        house: { mobilePinned: true },
        alerts: { mobilePinned: true },
        infra: { mobilePinned: true, visible: false },
        sites: { mobilePinned: true },
      },
    });
    expect(pinProblem(hidden)).toContain("Infrastructure is pinned");
  });
});
