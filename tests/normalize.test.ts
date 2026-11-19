import { describe, expect, it } from "vitest";
import {
  deriveRegion,
  normalizeBoolean,
  normalizeBudget,
  normalizeBudgetFlag,
  normalizeCapacity,
  normalizeNumeric,
  normalizeTriState,
  slugify,
  splitList,
} from "../api/lib/normalize";

describe("deriveRegion", () => {
  it("maps known cities case-insensitively", () => {
    expect(deriveRegion("Winter Park")).toBe("winter-park");
    expect(deriveRegion("  MAITLAND ")).toBe("winter-park");
    expect(deriveRegion("DeLand")).toBe("east");
  });
  it("returns unknown for blank or unlisted cities", () => {
    expect(deriveRegion(null)).toBe("unknown");
    expect(deriveRegion(undefined)).toBe("unknown");
    expect(deriveRegion("Atlantis")).toBe("unknown");
  });
});

describe("slugify", () => {
  it("lowercases, collapses punctuation and trims dashes", () => {
    expect(slugify("  Ever After Farms – Peach! ")).toBe("ever-after-farms-peach");
  });
});

describe("normalizeBudgetFlag", () => {
  it.each([
    ["Yes", "yes"],
    ["No", "no"],
    ["", "unknown"],
    [null, "unknown"],
    ["Unclear; likely yes", "unknown"],
    ["N/A; assume no", "unknown"],
    ["Yes (ceremony only)", "unknown"],
    ["Maybe", "unknown"],
  ])("%j -> %s", (raw, expected) => {
    expect(normalizeBudgetFlag(raw as string | null)).toBe(expected);
  });
});

describe("normalizeBudget", () => {
  it("under $2k implies under $5k", () => {
    expect(normalizeBudget("Yes", "No")).toEqual({ buckets: ["under-2k", "under-5k"], label: "Under $2k", eligible: true });
  });
  it("under $5k only", () => {
    expect(normalizeBudget("No", "Yes")).toEqual({ buckets: ["under-5k"], label: "Under $5k", eligible: true });
  });
  it("over $5k when both are no", () => {
    expect(normalizeBudget("No", "No")).toEqual({ buckets: [], label: "Over $5k", eligible: true });
  });
  it("is ineligible when both are blank or hedged", () => {
    expect(normalizeBudget("", "Unclear")).toEqual({ buckets: [], label: null, eligible: false });
  });
});

describe("normalizeCapacity", () => {
  it("uses the largest number in the text", () => {
    expect(normalizeCapacity("80 seated indoor; 150+ outdoor")).toEqual({ max: 150, eligible: true });
    expect(normalizeCapacity("Up to 180")).toEqual({ max: 180, eligible: true });
  });
  it.each(["", "TBD", "Varies", "Large", null])("is ineligible for %j", (raw) => {
    expect(normalizeCapacity(raw as string | null)).toEqual({ max: null, eligible: false });
  });
  it("keeps a number even when the text also says varies", () => {
    expect(normalizeCapacity("Varies, up to 200").max).toBe(200);
  });
});

describe("normalizeTriState", () => {
  it.each([
    ["Yes", "yes"],
    ["Yes — indoor weather contingency", "yes"],
    ["No", "no"],
    ["Limited", "partial"],
    ["Some", "partial"],
    ["Not stated", "unknown"],
    ["", "unknown"],
    [undefined, "unknown"],
    ["Perhaps", "unknown"],
  ])("%j -> %s", (raw, expected) => {
    expect(normalizeTriState(raw)).toBe(expected);
  });
});

describe("normalizeBoolean / normalizeNumeric / splitList", () => {
  it("normalizeBoolean is true only for yes-prefixed text", () => {
    expect(normalizeBoolean("Yes")).toBe(true);
    expect(normalizeBoolean("No")).toBe(false);
    expect(normalizeBoolean(null)).toBe(false);
  });
  it("normalizeNumeric strips symbols and rejects non-positive values", () => {
    expect(normalizeNumeric("$1,250")).toBe(1250);
    expect(normalizeNumeric("")).toBeNull();
    expect(normalizeNumeric("N/A")).toBeNull();
    expect(normalizeNumeric("0")).toBeNull();
  });
  it("splitList splits on commas and semicolons", () => {
    expect(splitList("Under $2k; Micro, Garden ;")).toEqual(["Under $2k", "Micro", "Garden"]);
    expect(splitList(null)).toEqual([]);
  });
});
