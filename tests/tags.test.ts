import { describe, expect, it } from "vitest";
import { STYLE_TAG_NAMES, topStyleForVenue } from "../api/lib/tags";

describe("topStyleForVenue", () => {
  it("returns the first listed style", () => {
    expect(topStyleForVenue("Garden Romance / Classic Elegance / Old-World Character")).toBe("Garden Romance");
    expect(topStyleForVenue("Old-World Character / Garden Romance")).toBe("Old-World Character");
  });
  it("is case- and whitespace-insensitive and returns the canonical spelling", () => {
    expect(topStyleForVenue("  modern + editorial / classic elegance")).toBe("Modern + Editorial");
  });
  it("returns null for blank or unrecognised styles", () => {
    expect(topStyleForVenue(null)).toBeNull();
    expect(topStyleForVenue(undefined)).toBeNull();
    expect(topStyleForVenue("")).toBeNull();
    expect(topStyleForVenue("Industrial Chic / Garden Romance")).toBeNull();
  });
  it("covers all five style names", () => {
    for (const name of STYLE_TAG_NAMES) expect(topStyleForVenue(name)).toBe(name);
  });
});
