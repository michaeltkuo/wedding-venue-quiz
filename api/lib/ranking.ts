import type { QuizAnswers, RankedVenue, VenueRow } from "./types";

// Ports the original client-side scoring in embed-app.html to the normalized Supabase venue schema.
// See question-to-field-mapping.md for the rationale behind each field mapping.

const VIBE_SYNONYMS: Record<string, string[]> = {
  garden: ["garden", "botanical"],
  european: ["european", "old-world", "old world"],
  modern: ["modern", "editorial", "contemporary"],
  rustic: ["rustic", "farm", "barn", "old florida"],
  classic: ["classic", "elegant", "traditional"],
};

const STYLE_PHRASES: Record<string, string> = {
  garden: "garden-forward setting",
  european: "old-world character",
  modern: "modern editorial energy",
  rustic: "relaxed rustic atmosphere",
  classic: "classic sense of occasion",
};

function stylePhrase(value: string | undefined): string {
  return (value && STYLE_PHRASES[value]) || "overall venue feel";
}

function venueVibeTokens(venue: VenueRow): string[] {
  return (venue.primary_vibe ?? "")
    .toLowerCase()
    .split("/")
    .map((token) => token.trim())
    .filter(Boolean);
}

// The sheet's "Primary Style / Vibe" column uses the quiz's five Q1 category names, so it is the only
// source of truth for style. Photo notes are not used: a barn whose notes mention a "garden ceremony"
// must not count as Garden Romance.
const VIBE_CATEGORY_NAMES: Record<string, string> = {
  garden: "garden romance",
  european: "old-world character",
  modern: "modern + editorial",
  rustic: "relaxed + rustic",
  classic: "classic elegance",
};

function matchesVibe(venue: VenueRow, answerVibe: string | undefined): boolean {
  if (!answerVibe) return false;
  const tokens = venueVibeTokens(venue);
  const category = VIBE_CATEGORY_NAMES[answerVibe];
  const knownCategories = Object.values(VIBE_CATEGORY_NAMES);
  if (category && tokens.some((token) => knownCategories.includes(token))) {
    return tokens.includes(category);
  }
  // Fallback for a venue whose style cell does not use the category names: best-effort keyword match.
  const synonyms = VIBE_SYNONYMS[answerVibe] ?? [answerVibe];
  if (tokens.some((token) => synonyms.some((syn) => token.includes(syn)))) return true;
  if (answerVibe === "garden" && venue.garden_flag) return true;
  if (answerVibe === "european" && venue.european_flag) return true;
  return false;
}

export function matchesBudget(venue: VenueRow, budgetAnswer: string | undefined): boolean {
  if (!budgetAnswer || budgetAnswer === "flexible") return true;
  if (budgetAnswer === "under-5k") {
    return venue.budget_buckets.includes("under-2k") || venue.budget_buckets.includes("under-5k");
  }
  return venue.budget_buckets.includes(budgetAnswer);
}

export function matchesGuestCount(venue: VenueRow, guestMinimum: number): boolean {
  return (venue.capacity_max ?? 0) >= guestMinimum;
}

function matchesFormat(venue: VenueRow, formatAnswer: string | undefined): boolean {
  if (!formatAnswer || formatAnswer === "open") return true;
  if (formatAnswer === "full") return venue.ceremony_reception === "yes";
  if (formatAnswer === "reception") return venue.reception_only === "yes" || venue.ceremony_reception === "yes";
  return false;
}

// An indoor reception that the sheet limits to a guest count ("Yes (70 guests or less)") only fits
// couples whose guest count is within that limit.
function indoorReceptionFits(venue: VenueRow, guestMinimum: number): boolean {
  if (venue.indoor_reception === "yes") return true;
  if (venue.indoor_reception === "partial") {
    return venue.indoor_reception_max_guests !== null && guestMinimum <= venue.indoor_reception_max_guests;
  }
  return false;
}

// Q5 is a hard filter on the ceremony/reception columns:
//   outdoor = outdoor ceremony AND outdoor reception (covered open-air counts as outdoor in the sheet)
//   indoor  = indoor ceremony AND indoor reception
//   both    = outdoor ceremony AND indoor reception
export function matchesSetting(venue: VenueRow, settingAnswer: string | undefined, guestMinimum: number): boolean {
  if (!settingAnswer || settingAnswer === "open") return true;
  if (settingAnswer === "outdoor") return venue.outdoor_ceremony === "yes" && venue.outdoor_reception === "yes";
  if (settingAnswer === "indoor") return venue.indoor_ceremony === "yes" && indoorReceptionFits(venue, guestMinimum);
  if (settingAnswer === "both") return venue.outdoor_ceremony === "yes" && indoorReceptionFits(venue, guestMinimum);
  return false;
}

function settingScore(venue: VenueRow, settingAnswer: string | undefined, guestMinimum: number): number {
  if (!settingAnswer || settingAnswer === "open") return 4;
  return matchesSetting(venue, settingAnswer, guestMinimum) ? 15 : 0;
}

// Q7 dealbreakers. A venue is only ruled out when the sheet clearly says it fails the dealbreaker;
// blank or unclear data is never treated as a "No".
// Cities far enough from Orlando to count as a long drive (Michael's list plus DeLand and Mims).
const LONG_DRIVE_CITIES = new Set([
  "daytona beach",
  "port orange",
  "st. augustine",
  "gainesville",
  "lake wales",
  "webster",
  "pierson",
  "deland",
  "mims",
]);

function violatesDealbreaker(venue: VenueRow, dealbreaker: string, guestMinimum: number): boolean {
  switch (dealbreaker) {
    case "outsideCaterer":
      // "Outside Catering Allowed?" = No covers both required in-house and approved-caterer-list venues.
      return /^no\.?$/i.test((venue.outside_vendors ?? "").trim());
    case "outdoorOnlyCeremony":
      // Only venues with no indoor ceremony space AND no weather backup. A venue that moves the
      // ceremony inside when it rains (e.g. Casa Feliz, Leu Gardens) still has a rain plan.
      return venue.indoor_ceremony === "no" && venue.weather_backup === "no";
    case "longDrive":
      return LONG_DRIVE_CITIES.has((venue.city_area ?? "").trim().toLowerCase());
    case "noAirConditionedReception":
      // Reception only. A guest-limited indoor reception does not help a couple over the limit.
      return venue.indoor_reception === "no" || (venue.indoor_reception === "partial" && !indoorReceptionFits(venue, guestMinimum));
    default:
      return false;
  }
}

export function countDealbreakerViolations(venue: VenueRow, dealbreakers: string[] | undefined, guestMinimum: number): number {
  return (dealbreakers ?? []).filter((item) => item !== "none" && violatesDealbreaker(venue, item, guestMinimum)).length;
}

function locationScore(venue: VenueRow, locationAnswer: string | undefined): number {
  if (!locationAnswer || locationAnswer === "open") return 10;
  return venue.region === locationAnswer ? 10 : 0;
}

// Q7 no longer asks about micro weddings; the guest-count bracket carries that signal. "Up To 50"
// still favors venues flagged as a micro-wedding fit.
function microPreference(answers: QuizAnswers): "yes" | "open" {
  const guests = answers.guestMinimum ?? 0;
  return guests > 0 && guests <= 50 ? "yes" : "open";
}

function microScore(venue: VenueRow, microAnswer: string | undefined): number {
  if (!microAnswer || microAnswer === "open") return 3;
  if (microAnswer === "yes") return venue.micro_wedding_fit ? 10 : 0;
  if (microAnswer === "no") return venue.micro_wedding_fit ? 0 : 10;
  return 0;
}

// Catering/Outside Vendors are free text (e.g. "must use one of venue's approved caterers"); these
// heuristics infer all-inclusive vs. bring-your-own-vendor fit until the sheet has cleaner enums.
function isAllInclusiveVenue(venue: VenueRow): boolean {
  const text = `${venue.catering ?? ""} ${venue.best_for ?? ""}`.toLowerCase();
  return text.includes("all-inclusive") || text.includes("all inclusive") || text.includes("in-house catering") || text.includes("included");
}

function allowsOutsideVendors(venue: VenueRow): boolean {
  const text = (venue.outside_vendors ?? "").toLowerCase();
  if (!text || text.includes("not stated")) return false;
  // The sheet's "Outside Catering Allowed?" column is a plain Yes/No.
  if (/^no\.?$/.test(text)) return false;
  if (/^yes\.?$/.test(text)) return true;
  if (text.includes("restricted") || text.includes("must use") || text.includes("approved list")) return false;
  return true;
}

function perksScore(venue: VenueRow, perks: string[]): number {
  let score = 0;
  if (perks.includes("weather") && venue.weather_backup === "yes") score += 5;
  if (perks.includes("lodging") && venue.overnight_accommodation === "yes") score += 8;
  if (perks.includes("allInclusive") && isAllInclusiveVenue(venue)) score += 6;
  if (perks.includes("vendors") && allowsOutsideVendors(venue)) score += 6;
  if (perks.includes("photos") && (venue.garden_flag || venue.historic_flag || venue.european_flag)) score += 8;
  return score;
}

function planningScore(venue: VenueRow, planningAnswer: string | undefined): number {
  if (!planningAnswer || planningAnswer === "open") return 3;
  if (planningAnswer === "allInclusive") return isAllInclusiveVenue(venue) ? 8 : 0;
  if (planningAnswer === "diy") return allowsOutsideVendors(venue) ? 8 : 0;
  return 0;
}

function priorityScore(venue: VenueRow, priorityAnswer: string | undefined, guestMinimum: number): number {
  if (!priorityAnswer) return 0;
  if (priorityAnswer === "photos" && (venue.garden_flag || venue.historic_flag || venue.european_flag)) return 8;
  if (priorityAnswer === "guestComfort" && (venue.capacity_max ?? 0) >= guestMinimum + 30) return 8;
  if (priorityAnswer === "unique" && (venue.historic_flag || venue.european_flag || venue.source_type_tags.some((tag) => tag.toLowerCase().includes("museum")))) return 8;
  if (priorityAnswer === "value" && venue.budget_buckets.includes("under-2k")) return 8;
  return 0;
}

export function scoreVenue(venue: VenueRow, answers: QuizAnswers): number {
  let score = 0;
  if (matchesVibe(venue, answers.vibe)) score += 30;
  // A venue whose first-listed style is the chosen one is a stronger fit than one listing it third.
  if (answers.vibe && venueVibeTokens(venue)[0] === VIBE_CATEGORY_NAMES[answers.vibe]) score += 10;
  if (matchesFormat(venue, answers.format)) score += 15;
  score += settingScore(venue, answers.setting, answers.guestMinimum ?? 0);
  score += locationScore(venue, answers.location);
  score += microScore(venue, microPreference(answers));
  score += perksScore(venue, answers.perks ?? []);
  score += planningScore(venue, answers.planning);
  score += priorityScore(venue, answers.priority, answers.guestMinimum ?? 0);
  return score;
}

function closestPenalty(venue: VenueRow, answers: QuizAnswers): number {
  const guestMinimum = answers.guestMinimum ?? 0;
  const budgetPenalty = matchesBudget(venue, answers.budget) ? 0 : 100;
  const capacityPenalty = matchesGuestCount(venue, guestMinimum) ? 0 : guestMinimum - (venue.capacity_max ?? 0);
  const settingPenalty = matchesSetting(venue, answers.setting, guestMinimum) ? 0 : 50;
  const dealbreakerPenalty = countDealbreakerViolations(venue, answers.dealbreakers, guestMinimum) * 50;
  return budgetPenalty + capacityPenalty + settingPenalty + dealbreakerPenalty;
}

// Every result shows one top match plus this many runners-up.
export const RESULT_COUNT = 4;

export interface RankResult {
  // exact   = all shown venues meet every requirement
  // narrow  = the top match meets every requirement, but at least one runner-up does not
  // closest = even the top match misses at least one requirement
  mode: "exact" | "narrow" | "closest";
  venues: RankedVenue[];
  // True when at least one shown venue misses a budget, guest-count, setting or dealbreaker requirement.
  someMissRequirements: boolean;
}

function meetsAllRequirements(venue: VenueRow, answers: QuizAnswers): boolean {
  const guestMinimum = answers.guestMinimum ?? 0;
  return (
    matchesBudget(venue, answers.budget) &&
    matchesGuestCount(venue, guestMinimum) &&
    matchesSetting(venue, answers.setting, guestMinimum) &&
    countDealbreakerViolations(venue, answers.dealbreakers, guestMinimum) === 0
  );
}

// Ranking order (Amy, Nov 18): style/vibe comes first, above everything else. A venue in the chosen
// style that misses one requirement beats a venue in another style that meets them all. Within the
// same style group: venues meeting every requirement, then venues that fit the guest count, then the
// fewest/smallest misses, then the weighted score. Results always fill all four slots.
export function rankVenues(venues: VenueRow[], answers: QuizAnswers): RankResult {
  const eligible = venues.filter((venue) => venue.launch_eligible);
  const guestMinimum = answers.guestMinimum ?? 0;

  const ranked = eligible
    .map((venue) => ({
      venue,
      styleMatch: matchesVibe(venue, answers.vibe),
      meetsAll: meetsAllRequirements(venue, answers),
      guestFits: matchesGuestCount(venue, guestMinimum),
      penalty: closestPenalty(venue, answers),
      score: scoreVenue(venue, answers),
    }))
    .sort(
      (a, b) =>
        Number(b.styleMatch) - Number(a.styleMatch) ||
        Number(b.meetsAll) - Number(a.meetsAll) ||
        Number(b.guestFits) - Number(a.guestFits) ||
        a.penalty - b.penalty ||
        b.score - a.score ||
        (b.venue.capacity_max ?? 0) - (a.venue.capacity_max ?? 0)
    )
    .slice(0, RESULT_COUNT);

  const topMeetsAll = ranked[0]?.meetsAll ?? false;
  const someMissRequirements = ranked.some((item) => !item.meetsAll);

  return {
    mode: !topMeetsAll ? "closest" : someMissRequirements ? "narrow" : "exact",
    venues: ranked.map(({ venue, score }) => ({ ...venue, score })),
    someMissRequirements,
  };
}

export function buildSummary(venue: RankedVenue, answers: QuizAnswers): string {
  const reasons: string[] = [];
  const perks = answers.perks ?? [];

  if (matchesVibe(venue, answers.vibe)) {
    reasons.push(`the ${stylePhrase(answers.vibe)} you selected`);
  }
  const guestMinimum = answers.guestMinimum ?? 0;
  if (matchesSetting(venue, answers.setting, guestMinimum)) {
    if (answers.setting === "both") reasons.push("an outdoor ceremony with an indoor reception");
    else if (answers.setting === "outdoor") reasons.push("a ceremony and reception held outdoors");
    else if (answers.setting === "indoor") reasons.push("a climate-controlled indoor ceremony and reception");
  }
  if (microPreference(answers) === "yes" && venue.micro_wedding_fit) {
    reasons.push("a genuine micro-wedding fit");
  }
  if (perks.includes("lodging") && venue.overnight_accommodation === "yes") {
    reasons.push("the option of an overnight stay");
  }
  if (perks.includes("weather") && venue.weather_backup === "yes") {
    reasons.push("the weather backup you wanted");
  }
  if (reasons.length === 0) {
    reasons.push("the practical and visual priorities in your quiz answers");
  }

  const firstReasons = reasons.slice(0, 3);
  const joined =
    firstReasons.length === 1
      ? firstReasons[0]
      : `${firstReasons.slice(0, -1).join(", ")} and ${firstReasons[firstReasons.length - 1]}`;

  // Reviewed per-venue copy ("Top Match Description" column) wins; fall back to the sheet's raw notes.
  const note = venue.top_match_description || venue.photo_notes || venue.best_for || "";
  return `Matches ${joined}.${note ? ` ${note}` : ""}`;
}

export function buildDisplayTags(venue: RankedVenue, answers: QuizAnswers): string[] {
  const labels: string[] = [];
  const perks = answers.perks ?? [];
  if (matchesVibe(venue, answers.vibe)) labels.push(stylePhrase(answers.vibe));
  if (microPreference(answers) === "yes" && venue.micro_wedding_fit) labels.push("micro wedding fit");
  if (venue.weather_backup === "yes" && (answers.setting === "both" || perks.includes("weather"))) labels.push("weather backup");
  if (venue.overnight_accommodation === "yes" && perks.includes("lodging")) labels.push("overnight stay");
  if (isAllInclusiveVenue(venue) && (perks.includes("allInclusive") || answers.planning === "allInclusive")) labels.push("guided planning");
  if (labels.length === 0) labels.push("strong overall fit");
  return labels.slice(0, 4);
}
