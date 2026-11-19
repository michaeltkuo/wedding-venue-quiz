import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseVenueCsv } from "../api/lib/importVenues";
import { rankVenues, scoreVenue } from "../api/lib/ranking";
import {
  EMBEDDINGS_PATH,
  FEEL_ANSWERS,
  SEMANTIC_WEIGHT,
  feelAnswerKeys,
  isFeelAnswer,
  loadSemanticIndex,
  semanticAnswerText,
  semanticPoints,
  semanticVenueText,
  textHash,
  venueVector,
  type SemanticIndex,
} from "../api/lib/semantic";
import type { VenueRow } from "../api/lib/types";
import { extractQuizOptions } from "../scripts/quizOptions";
import { makeVenue } from "./helpers";

// A tiny hand-made index: 2-d unit vectors, so similarities are easy to reason about.
function venueWithVector(slug: string, overrides: Partial<VenueRow> = {}): VenueRow {
  return makeVenue({ id: slug, slug, name: slug, photo_notes: `${slug} notes`, ...overrides });
}
function entry(venue: VenueRow, vector: number[]) {
  return { hash: textHash(semanticVenueText(venue)), vector };
}

describe("text helpers", () => {
  it("hashes deterministically to 16 hex characters", () => {
    expect(textHash("garden")).toBe(textHash("garden"));
    expect(textHash("garden")).not.toBe(textHash("gardens"));
    expect(textHash("garden")).toMatch(/^[0-9a-f]{16}$/);
  });
  it("builds venue text from the positive free-text columns only, never Not Ideal For", () => {
    const venue = makeVenue({
      photo_notes: " Oaks ",
      best_for: "Barn lovers",
      top_match_description: null,
      runners_up_description: "Rustic charm.",
      not_ideal_for: "Couples wanting a garden",
    });
    expect(semanticVenueText(venue)).toBe("Oaks Barn lovers Rustic charm.");
    expect(semanticVenueText(makeVenue())).toBe("");
  });
  it("builds answer text from the title and description couples see", () => {
    expect(semanticAnswerText(" Garden Romance ", "Lush grounds. ")).toBe("Garden Romance. Lush grounds.");
  });
});

describe("feel answers", () => {
  it("uses every style, only the feel-based priorities, and only the portrait perk", () => {
    expect(isFeelAnswer("vibe", "anything")).toBe(true);
    expect(isFeelAnswer("priority", "unique")).toBe(true);
    expect(isFeelAnswer("priority", "value")).toBe(false);
    expect(isFeelAnswer("perks", "lodging")).toBe(false);
    expect(isFeelAnswer("budget", "flexible")).toBe(false);
  });
  it("collects the couple's feel answers as question:value keys", () => {
    expect(feelAnswerKeys({})).toEqual([]);
    expect(feelAnswerKeys({ vibe: "rustic", priority: "value", perks: ["lodging", "photos"] })).toEqual(["vibe:rustic", "perks:photos"]);
    expect(feelAnswerKeys({ vibe: "modern", priority: "photos" })).toEqual(["vibe:modern", "priority:photos"]);
  });
});

describe("semanticPoints", () => {
  const near = venueWithVector("near");
  const mid = venueWithVector("mid");
  const far = venueWithVector("far");
  const index: SemanticIndex = {
    model: "test",
    answers: { "vibe:garden": { hash: "x", vector: [1, 0] }, "priority:unique": { hash: "y", vector: [0, 1] } },
    venues: { near: entry(near, [1, 0]), mid: entry(mid, [0.6, 0.8]), far: entry(far, [0, 1]) },
  };

  it("gives the most similar venue the full weight and the least similar none", () => {
    const points = semanticPoints([near, mid, far], { vibe: "garden" }, index);
    expect(points.get("near")).toBe(SEMANTIC_WEIGHT);
    expect(points.get("far")).toBe(0);
    expect(points.get("mid")).toBeCloseTo(SEMANTIC_WEIGHT * 0.6, 1);
  });
  it("averages over several feel answers", () => {
    const points = semanticPoints([near, mid, far], { vibe: "garden", priority: "unique" }, index);
    // near and far each match one answer fully; mid matches both partly (0.7 average).
    expect(points.get("mid")).toBe(SEMANTIC_WEIGHT);
    expect(points.get("near")).toBe(0);
    expect(points.get("far")).toBe(0);
  });
  it("puts venues with a missing or stale vector at the midpoint", () => {
    const edited = venueWithVector("near", { photo_notes: "rewritten in the sheet" });
    const unknown = venueWithVector("unknown");
    const points = semanticPoints([edited, unknown, mid, far], { vibe: "garden" }, index);
    expect(venueVector(index, edited)).toBeNull();
    expect(points.get("near")).toBe(SEMANTIC_WEIGHT / 2);
    expect(points.get("unknown")).toBe(SEMANTIC_WEIGHT / 2);
    expect(points.get("mid")).toBe(SEMANTIC_WEIGHT);
  });
  it("puts everyone at the midpoint when no venue can be told apart", () => {
    const points = semanticPoints([near, venueWithVector("other")], { vibe: "garden" }, index);
    expect([...points.values()]).toEqual([SEMANTIC_WEIGHT / 2, SEMANTIC_WEIGHT / 2]);
  });
  it("adds nothing when none of the couple's answers has a vector", () => {
    expect(semanticPoints([near, far], { vibe: "modern", priority: "value" }, index).size).toBe(0);
    expect(semanticPoints([near, far], {}, index).size).toBe(0);
  });

  describe("in the ranking", () => {
    const answers = { vibe: "garden", guestMinimum: 50, perks: ["photos"], priority: "unique" };
    const flagged = venueWithVector("far", { primary_vibe: "Garden Romance", garden_flag: true, historic_flag: true });
    const plain = venueWithVector("near", { primary_vibe: "Garden Romance" });

    it("replaces the flag-based portrait and distinctive bonuses but keeps the rest of the score", () => {
      const rules = scoreVenue(flagged, answers);
      expect(rules - scoreVenue(plain, answers)).toBe(16);
      expect(scoreVenue(flagged, answers, 0)).toBe(rules - 16);
      expect(scoreVenue(flagged, answers, 7.5)).toBe(rules - 16 + 7.5);
    });
    it("reorders venues within the same requirement tier by similarity", () => {
      const both = { ...index, answers: { ...index.answers, "perks:photos": { hash: "z", vector: [1, 0] } } };
      const garden = { vibe: "garden", guestMinimum: 50, perks: ["photos"] };
      expect(rankVenues([flagged, plain], garden).venues[0].slug).toBe("far");
      expect(rankVenues([flagged, plain], garden, both).venues[0].slug).toBe("near");
    });
    it("never lifts a venue that misses a requirement above one that meets them all", () => {
      const tooSmall = venueWithVector("near", { primary_vibe: "Garden Romance", capacity_max: 20 });
      const fits = venueWithVector("far", { primary_vibe: "Garden Romance", capacity_max: 200 });
      const result = rankVenues([tooSmall, fits], { vibe: "garden", guestMinimum: 100 }, index);
      expect(result.venues.map((venue) => venue.slug)).toEqual(["far", "near"]);
    });
    it("falls back to the rule-based score when the couple has no answer with a vector", () => {
      const result = rankVenues([flagged, plain], { vibe: "modern", guestMinimum: 50, perks: ["photos"] }, index);
      expect(result.venues[0].score).toBe(scoreVenue(flagged, { vibe: "modern", guestMinimum: 50, perks: ["photos"] }));
    });
  });
});

describe("loadSemanticIndex", () => {
  it("loads and caches the committed file", () => {
    const index = loadSemanticIndex();
    expect(loadSemanticIndex()).toBe(index);
    expect(index.model).toBeTruthy();
  });
  it("reads another path without caching it", () => {
    // Same file through a different (unnormalized) path string: read fresh each time.
    const samefile = EMBEDDINGS_PATH.replace(/data([\\/])venue-embeddings/, "data$1..$1data$1venue-embeddings");
    expect(samefile).not.toBe(EMBEDDINGS_PATH);
    expect(loadSemanticIndex(samefile)).not.toBe(loadSemanticIndex(samefile));
    expect(loadSemanticIndex(samefile)).toEqual(loadSemanticIndex());
    expect(() => loadSemanticIndex(join(__dirname, "missing.json"))).toThrow();
  });
});

// Guards the committed vectors. If one of these fails, the venue sheet or the quiz wording changed
// without re-running the embedder:  npm run embed:install (once), then npm run embed
describe("data/venue-embeddings.json is up to date", () => {
  const root = join(__dirname, "..");
  const index = loadSemanticIndex();
  const venues = parseVenueCsv(readFileSync(join(root, "data", "venues.csv"), "utf8")).records.map(
    (record) => ({ id: record.slug, ...record }) as VenueRow
  );
  const feelOptions = extractQuizOptions(readFileSync(join(root, "embed-app.html"), "utf8")).filter((option) =>
    isFeelAnswer(option.question, option.value)
  );

  it("has a current vector for every launch-eligible venue", () => {
    const stale = venues.filter((venue) => venue.launch_eligible && venueVector(index, venue) === null).map((venue) => venue.name);
    expect(stale, "re-run `npm run embed`").toEqual([]);
  });
  it("has a current vector for exactly the quiz's feel answers", () => {
    const expected = Object.fromEntries(
      feelOptions.map((option) => [`${option.question}:${option.value}`, textHash(semanticAnswerText(option.title, option.description))])
    );
    const actual = Object.fromEntries(Object.entries(index.answers).map(([key, value]) => [key, value.hash]));
    expect(actual, "re-run `npm run embed`").toEqual(expected);
    expect(Object.keys(FEEL_ANSWERS).every((question) => feelOptions.some((option) => option.question === question))).toBe(true);
  });
  it("stores unit-length vectors of one size", () => {
    const vectors = [...Object.values(index.answers), ...Object.values(index.venues)].map((value) => value.vector);
    const size = vectors[0].length;
    for (const vector of vectors) {
      expect(vector).toHaveLength(size);
      expect(Math.hypot(...vector)).toBeCloseTo(1, 3);
    }
  });
});

describe("extractQuizOptions", () => {
  it("reads every question's options from embed-app.html", () => {
    const options = extractQuizOptions(readFileSync(join(__dirname, "..", "embed-app.html"), "utf8"));
    const questions = [...new Set(options.map((option) => option.question))];
    expect(questions).toEqual(["vibe", "guestCount", "budget", "format", "setting", "location", "dealbreakers", "perks", "planning", "priority"]);
    expect(options.find((option) => option.value === "garden")?.title).toBe("Garden Romance");
    expect(options.find((option) => option.value === "up-to-50")?.description).toMatch(/micro wedding/);
  });
  it("fails loudly if the questions array moves", () => {
    expect(() => extractQuizOptions("<html></html>")).toThrow(/const questions/);
  });
});
