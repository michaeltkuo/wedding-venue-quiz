import { describe, expect, it } from "vitest";
import {
  RESULT_COUNT,
  buildDisplayTags,
  buildSummary,
  countDealbreakerViolations,
  matchesBudget,
  matchesGuestCount,
  matchesSetting,
  rankVenues,
  scoreVenue,
} from "../api/lib/ranking";
import type { QuizAnswers } from "../api/lib/types";
import { makeVenue } from "./helpers";

describe("matchesBudget", () => {
  const under2k = makeVenue({ budget_buckets: ["under-2k", "under-5k"] });
  const under5k = makeVenue({ budget_buckets: ["under-5k"] });
  const over = makeVenue({ budget_buckets: [] });
  it("passes everything for blank or flexible", () => {
    expect(matchesBudget(over, undefined)).toBe(true);
    expect(matchesBudget(over, "flexible")).toBe(true);
  });
  it("under-5k accepts either bucket; under-2k only the cheaper one", () => {
    expect(matchesBudget(under2k, "under-5k")).toBe(true);
    expect(matchesBudget(under5k, "under-5k")).toBe(true);
    expect(matchesBudget(over, "under-5k")).toBe(false);
    expect(matchesBudget(under5k, "under-2k")).toBe(false);
    expect(matchesBudget(under2k, "under-2k")).toBe(true);
  });
});

describe("matchesGuestCount", () => {
  it("compares capacity to the minimum, treating unknown capacity as zero", () => {
    expect(matchesGuestCount(makeVenue({ capacity_max: 100 }), 100)).toBe(true);
    expect(matchesGuestCount(makeVenue({ capacity_max: 99 }), 100)).toBe(false);
    expect(matchesGuestCount(makeVenue({ capacity_max: null }), 1)).toBe(false);
  });
});

describe("matchesSetting", () => {
  it("open or blank always matches; unknown answers never do", () => {
    const v = makeVenue();
    expect(matchesSetting(v, undefined, 0)).toBe(true);
    expect(matchesSetting(v, "open", 0)).toBe(true);
    expect(matchesSetting(v, "sideways", 0)).toBe(false);
  });
  it("outdoor needs outdoor ceremony and reception", () => {
    expect(matchesSetting(makeVenue(), "outdoor", 0)).toBe(true);
    expect(matchesSetting(makeVenue({ outdoor_reception: "no" }), "outdoor", 0)).toBe(false);
  });
  it("indoor needs indoor ceremony and a reception that fits the guest count", () => {
    expect(matchesSetting(makeVenue(), "indoor", 200)).toBe(true);
    expect(matchesSetting(makeVenue({ indoor_ceremony: "no" }), "indoor", 0)).toBe(false);
    const limited = makeVenue({ indoor_reception: "partial", indoor_reception_max_guests: 70 });
    expect(matchesSetting(limited, "indoor", 70)).toBe(true);
    expect(matchesSetting(limited, "indoor", 71)).toBe(false);
    expect(matchesSetting(makeVenue({ indoor_reception: "partial", indoor_reception_max_guests: null }), "indoor", 10)).toBe(false);
    expect(matchesSetting(makeVenue({ indoor_reception: "no" }), "indoor", 10)).toBe(false);
  });
  it("both needs outdoor ceremony plus a fitting indoor reception", () => {
    expect(matchesSetting(makeVenue(), "both", 0)).toBe(true);
    expect(matchesSetting(makeVenue({ outdoor_ceremony: "no" }), "both", 0)).toBe(false);
    expect(matchesSetting(makeVenue({ indoor_reception: "no" }), "both", 0)).toBe(false);
  });
});

describe("countDealbreakerViolations", () => {
  it("counts only clear failures and ignores none/unknown ids", () => {
    const v = makeVenue({
      outside_vendors: "No",
      indoor_ceremony: "no",
      weather_backup: "no",
      city_area: "DeLand",
      indoor_reception: "no",
    });
    expect(countDealbreakerViolations(v, ["outsideCaterer", "outdoorOnlyCeremony", "longDrive", "noAirConditionedReception"], 0)).toBe(4);
    expect(countDealbreakerViolations(v, ["none", "mystery"], 0)).toBe(0);
    expect(countDealbreakerViolations(v, undefined, 0)).toBe(0);
  });
  it("blank or unclear data is not a violation", () => {
    const v = makeVenue({ outside_vendors: "Not stated", indoor_ceremony: "unknown", city_area: null, indoor_reception: "unknown" });
    expect(countDealbreakerViolations(v, ["outsideCaterer", "outdoorOnlyCeremony", "longDrive", "noAirConditionedReception"], 0)).toBe(0);
  });
  it("a guest-limited indoor reception only violates when the party is over the limit", () => {
    const v = makeVenue({ indoor_reception: "partial", indoor_reception_max_guests: 70 });
    expect(countDealbreakerViolations(v, ["noAirConditionedReception"], 70)).toBe(0);
    expect(countDealbreakerViolations(v, ["noAirConditionedReception"], 100)).toBe(1);
  });
});

describe("scoreVenue", () => {
  const venue = makeVenue({
    primary_vibe: "Garden Romance / Classic Elegance",
    micro_wedding_fit: true,
    weather_backup: "yes",
    overnight_accommodation: "yes",
    garden_flag: true,
    catering: "All-inclusive packages",
    outside_vendors: "Yes",
    region: "orlando",
    capacity_max: 200,
    budget_buckets: ["under-2k", "under-5k"],
  });

  it("gives a blank quiz only the default points (format 15 + setting 4 + location 10 + micro 3 + planning 3)", () => {
    expect(scoreVenue(makeVenue({ primary_vibe: null }), {})).toBe(35);
  });

  it("rewards a first-listed style more than a later one", () => {
    const first = scoreVenue(makeVenue({ primary_vibe: "Garden Romance / Classic Elegance" }), { vibe: "garden" });
    const second = scoreVenue(makeVenue({ primary_vibe: "Classic Elegance / Garden Romance" }), { vibe: "garden" });
    expect(first - second).toBe(10);
  });

  it("rewards perks, planning style and priority", () => {
    const base: QuizAnswers = { vibe: "garden", guestMinimum: 40 };
    const plain = scoreVenue(venue, base);
    const perks = scoreVenue(venue, { ...base, perks: ["weather", "lodging", "allInclusive", "vendors", "photos"] });
    expect(perks - plain).toBe(5 + 8 + 6 + 6 + 8);
    expect(scoreVenue(venue, { ...base, planning: "allInclusive" })).toBeGreaterThan(plain);
    expect(scoreVenue(venue, { ...base, planning: "diy" })).toBeGreaterThan(plain);
    expect(scoreVenue(venue, { ...base, planning: "mystery" })).toBeLessThan(plain);
    for (const priority of ["photos", "guestComfort", "unique", "value"]) {
      const withPriority = scoreVenue(makeVenue({ ...venue, historic_flag: true }), { ...base, priority });
      const without = scoreVenue(makeVenue({ ...venue, historic_flag: true }), base);
      expect(withPriority - without).toBe(8);
    }
    expect(scoreVenue(venue, { ...base, priority: "mystery" })).toBe(plain);
  });

  it("scores location, format and micro preference", () => {
    expect(scoreVenue(venue, { location: "orlando" })).toBeGreaterThan(scoreVenue(venue, { location: "north" }));
    expect(scoreVenue(venue, { format: "full" })).toBeGreaterThan(scoreVenue(makeVenue({ ...venue, ceremony_reception: "no" }), { format: "full" }));
    const micro = scoreVenue(venue, { guestMinimum: 50 });
    const notMicro = scoreVenue(makeVenue({ ...venue, micro_wedding_fit: false }), { guestMinimum: 50 });
    expect(micro).toBeGreaterThan(notMicro);
  });

  it("scores the reception-only format and ignores unknown formats", () => {
    const receptionOnly = makeVenue({ ceremony_reception: "no", reception_only: "yes" });
    const neither = makeVenue({ ceremony_reception: "no", reception_only: "no" });
    expect(scoreVenue(receptionOnly, { format: "reception" })).toBeGreaterThan(scoreVenue(neither, { format: "reception" }));
    expect(scoreVenue(venue, { format: "reception" })).toBe(scoreVenue(venue, { format: "open" }));
    expect(scoreVenue(venue, { format: "mystery" })).toBe(scoreVenue(venue, { format: "open" }) - 15);
  });

  it("scores all-inclusive and vendor heuristics from free text", () => {
    const restricted = makeVenue({ outside_vendors: "must use venue list", catering: null });
    const open = makeVenue({ outside_vendors: "Bring anyone you like", catering: null });
    const no = makeVenue({ outside_vendors: "No", catering: null });
    const yes = makeVenue({ outside_vendors: "Yes.", catering: null });
    const unstated = makeVenue({ outside_vendors: "Not stated", catering: null });
    const diy = (v: ReturnType<typeof makeVenue>) => scoreVenue(v, { planning: "diy" });
    expect(diy(open)).toBeGreaterThan(diy(restricted));
    expect(diy(yes)).toBeGreaterThan(diy(no));
    expect(diy(yes)).toBeGreaterThan(diy(unstated));
    expect(diy(makeVenue({ outside_vendors: null }))).toBe(diy(unstated));
  });
});

describe("rankVenues", () => {
  const garden = makeVenue({ id: "g", name: "Garden", primary_vibe: "Garden Romance", capacity_max: 100 });
  const modern = makeVenue({ id: "m", name: "Modern", primary_vibe: "Modern + Editorial", capacity_max: 100 });
  const rustic = makeVenue({ id: "r", name: "Rustic", primary_vibe: "Relaxed + Rustic", capacity_max: 100 });
  const classic = makeVenue({ id: "c", name: "Classic", primary_vibe: "Classic Elegance", capacity_max: 100 });
  const hidden = makeVenue({ id: "h", name: "Hidden", launch_eligible: false });

  it("ranks the chosen style first and skips launch-ineligible venues", () => {
    const result = rankVenues([hidden, modern, garden, rustic, classic], { vibe: "garden", guestMinimum: 50 });
    expect(result.venues[0].name).toBe("Garden");
    expect(result.venues.map((v) => v.name)).not.toContain("Hidden");
    expect(result.mode).toBe("exact");
    expect(result.someMissRequirements).toBe(false);
  });

  it("always returns up to RESULT_COUNT venues", () => {
    const many = Array.from({ length: 8 }, (_, i) => makeVenue({ id: `v${i}`, name: `V${i}` }));
    expect(rankVenues(many, {}).venues).toHaveLength(RESULT_COUNT);
    expect(rankVenues([garden], {}).venues).toHaveLength(1);
  });

  it("reports narrow when only a runner-up misses a requirement", () => {
    const tooSmall = makeVenue({ id: "s", name: "Small", primary_vibe: "Garden Romance", capacity_max: 20 });
    const result = rankVenues([garden, tooSmall], { vibe: "garden", guestMinimum: 80 });
    expect(result.venues[0].name).toBe("Garden");
    expect(result.mode).toBe("narrow");
    expect(result.someMissRequirements).toBe(true);
  });

  it("reports closest when even the top match misses a requirement", () => {
    const result = rankVenues([garden], { vibe: "garden", guestMinimum: 500 });
    expect(result.mode).toBe("closest");
  });

  it("holds firm on budget before setting when no venue meets everything", () => {
    const cheapIndoor = makeVenue({ id: "ci", name: "CheapIndoor", primary_vibe: "Garden Romance", outdoor_ceremony: "no", budget_buckets: ["under-2k", "under-5k"] });
    const pricyOutdoor = makeVenue({ id: "po", name: "PricyOutdoor", primary_vibe: "Garden Romance", budget_buckets: [] });
    const result = rankVenues([pricyOutdoor, cheapIndoor], { vibe: "garden", budget: "under-2k", setting: "outdoor", guestMinimum: 50 });
    expect(result.venues[0].name).toBe("CheapIndoor");
  });

  it("is safe with no venues", () => {
    const result = rankVenues([], {});
    expect(result.venues).toEqual([]);
    expect(result.mode).toBe("closest");
  });

  it("breaks ties by capacity", () => {
    const big = makeVenue({ id: "b", name: "Big", capacity_max: 400 });
    const small = makeVenue({ id: "s", name: "Small", capacity_max: 200 });
    expect(rankVenues([small, big], {}).venues[0].name).toBe("Big");
  });
});

describe("buildSummary", () => {
  const venue = makeVenue({ micro_wedding_fit: true, overnight_accommodation: "yes", weather_backup: "yes", garden_flag: true });
  const ranked = { ...venue, score: 50 };

  it("lists up to three reasons and appends the reviewed copy first", () => {
    const text = buildSummary({ ...ranked, top_match_description: "Reviewed copy." }, {
      vibe: "garden",
      setting: "outdoor",
      guestMinimum: 40,
      perks: ["lodging", "weather"],
    });
    expect(text).toBe("Matches the garden-forward setting you selected, a ceremony and reception held outdoors and a genuine micro-wedding fit. Reviewed copy.");
  });

  it("describes each setting choice", () => {
    expect(buildSummary(ranked, { setting: "both" })).toContain("an outdoor ceremony with an indoor reception");
    expect(buildSummary(ranked, { setting: "indoor" })).toContain("a climate-controlled indoor ceremony and reception");
  });

  it("uses lodging and weather reasons and falls back to notes", () => {
    const text = buildSummary({ ...ranked, photo_notes: "Lovely light." }, { perks: ["lodging", "weather"] });
    expect(text).toBe("Matches the option of an overnight stay and the weather backup you wanted. Lovely light.");
  });

  it("falls back to a generic reason and omits notes when there are none", () => {
    const bare = { ...makeVenue(), score: 1 };
    expect(buildSummary(bare, {})).toBe("Matches the practical and visual priorities in your quiz answers.");
    expect(buildSummary({ ...bare, best_for: "Garden lovers" }, {})).toMatch(/Garden lovers$/);
  });
});

describe("buildDisplayTags", () => {
  it("collects up to four relevant tags", () => {
    const venue = { ...makeVenue({ micro_wedding_fit: true, weather_backup: "yes", overnight_accommodation: "yes", catering: "all-inclusive" }), score: 1 };
    const tags = buildDisplayTags(venue, {
      vibe: "garden",
      guestMinimum: 40,
      setting: "both",
      perks: ["lodging", "allInclusive"],
      planning: "allInclusive",
    });
    expect(tags).toEqual(["garden-forward setting", "micro wedding fit", "weather backup", "overnight stay"]);
  });
  it("adds guided planning and has a fallback", () => {
    const venue = { ...makeVenue({ primary_vibe: null, catering: "in-house catering" }), score: 1 };
    expect(buildDisplayTags(venue, { planning: "allInclusive" })).toEqual(["guided planning"]);
    expect(buildDisplayTags({ ...makeVenue({ primary_vibe: null }), score: 1 }, {})).toEqual(["strong overall fit"]);
  });
});

describe("style matching", () => {
  it("only matches the exact category when the cell uses the five category names", () => {
    const rusticBarn = makeVenue({ primary_vibe: "Relaxed + Rustic", garden_flag: true, photo_notes: "garden ceremony" });
    expect(scoreVenue(rusticBarn, { vibe: "garden" })).toBeLessThan(scoreVenue(makeVenue({ primary_vibe: "Garden Romance" }), { vibe: "garden" }));
  });
  it("falls back to keywords and flags for free-text style cells", () => {
    const free = (primary_vibe: string | null, extra = {}) => makeVenue({ primary_vibe, ...extra });
    const score = (v: ReturnType<typeof makeVenue>, vibe: string) => scoreVenue(v, { vibe });
    const baseline = (vibe: string) => score(free("something else"), vibe);
    expect(score(free("botanical retreat"), "garden")).toBeGreaterThan(baseline("garden"));
    expect(score(free("barn wedding"), "rustic")).toBeGreaterThan(baseline("rustic"));
    expect(score(free("???", { garden_flag: true }), "garden")).toBeGreaterThan(baseline("garden"));
    expect(score(free("???", { european_flag: true }), "european")).toBeGreaterThan(baseline("european"));
    expect(score(free("whatever"), "unknownstyle")).toBe(baseline("unknownstyle"));
    expect(buildDisplayTags({ ...free("whatever"), score: 1 }, { vibe: "unknownstyle" })).toEqual(["strong overall fit"]);
  });
});
