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

// Primary Style / Vibe is free text (e.g. "Botanical / romantic / historic / garden"), so this is a
// best-effort keyword match rather than an exact enum comparison. Revisit after reviewing real results.
function matchesVibe(venue: VenueRow, answerVibe: string | undefined): boolean {
  if (!answerVibe) return false;
  const synonyms = VIBE_SYNONYMS[answerVibe] ?? [answerVibe];
  const tokens = venueVibeTokens(venue);
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

function settingScore(venue: VenueRow, settingAnswer: string | undefined): number {
  if (!settingAnswer || settingAnswer === "open") return 4;
  if (settingAnswer === "outdoor" && venue.outdoor_support === "yes") return 15;
  if (settingAnswer === "indoor" && venue.indoor_support === "yes") return 15;
  if (settingAnswer === "both" && venue.outdoor_support === "yes" && venue.indoor_support !== "no") return 15;
  return 0;
}

function locationScore(venue: VenueRow, locationAnswer: string | undefined): number {
  if (!locationAnswer || locationAnswer === "open") return 10;
  return venue.region === locationAnswer ? 10 : 0;
}

// Q7 was the micro-wedding question; Q2's guest count now carries that signal. A venue Amy marked as a
// micro-wedding fit gets the same boost whenever the couple picks the smallest guest-count range.
function microScore(venue: VenueRow, guestCountAnswer: string | undefined): number {
  return guestCountAnswer === "up-to-50" && venue.micro_wedding_fit ? 10 : 0;
}

// Q7 dealbreakers lower a venue's score instead of removing it, so couples always see four results.
// A full-strength hit (40) outweighs a perfect style match (30), so a venue with the couple's dealbreaker
// almost never outranks one without it.
const DEALBREAKER_PENALTY = 40;
const SECONDARY_STYLE_PENALTY = 10;

// Primary Style / Vibe lists up to three styles in order of importance ("Garden Romance / Classic
// Elegance / Old-World Character"), so a style listed first is penalized fully and a later one lightly.
const DEALBREAKER_STYLES: Record<string, string> = {
  rustic: "rustic",
  modern: "modern",
  oldWorld: "old-world",
};

// Cities roughly an hour or more from Orlando. Amy maintains this list as venues are added.
const FAR_FROM_ORLANDO = new Set([
  "daytona beach",
  "port orange",
  "st. augustine",
  "gainesville",
  "lake wales",
  "webster",
  "pierson",
]);

function dealbreakerPenalty(venue: VenueRow, dealbreaker: string | undefined): number {
  if (!dealbreaker || dealbreaker === "none") return 0;
  const style = DEALBREAKER_STYLES[dealbreaker];
  if (style) {
    const position = venueVibeTokens(venue).findIndex((token) => token.includes(style));
    if (position === 0) return DEALBREAKER_PENALTY;
    return position > 0 ? SECONDARY_STYLE_PENALTY : 0;
  }
  if (dealbreaker === "outdoorCeremony") return venue.outdoor_only_ceremony ? DEALBREAKER_PENALTY : 0;
  if (dealbreaker === "longDrive") {
    return FAR_FROM_ORLANDO.has((venue.city_area ?? "").trim().toLowerCase()) ? DEALBREAKER_PENALTY : 0;
  }
  if (dealbreaker === "inHouseCatering") return venue.requires_in_house_catering ? DEALBREAKER_PENALTY : 0;
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
  if (matchesFormat(venue, answers.format)) score += 15;
  score += settingScore(venue, answers.setting);
  score += locationScore(venue, answers.location);
  score += microScore(venue, answers.guestCount);
  score -= dealbreakerPenalty(venue, answers.dealbreaker);
  score += perksScore(venue, answers.perks ?? []);
  score += planningScore(venue, answers.planning);
  score += priorityScore(venue, answers.priority, answers.guestMinimum ?? 0);
  return score;
}

function closestPenalty(venue: VenueRow, answers: QuizAnswers): number {
  const guestMinimum = answers.guestMinimum ?? 0;
  const budgetPenalty = matchesBudget(venue, answers.budget) ? 0 : 100;
  const capacityPenalty = matchesGuestCount(venue, guestMinimum) ? 0 : guestMinimum - (venue.capacity_max ?? 0);
  return budgetPenalty + capacityPenalty;
}

export interface RankResult {
  mode: "exact" | "narrow" | "closest";
  venues: RankedVenue[];
}

export function rankVenues(venues: VenueRow[], answers: QuizAnswers): RankResult {
  const eligible = venues.filter((venue) => venue.launch_eligible);
  const guestMinimum = answers.guestMinimum ?? 0;

  const exactMatches: RankedVenue[] = eligible
    .filter((venue) => matchesBudget(venue, answers.budget) && matchesGuestCount(venue, guestMinimum))
    .map((venue) => ({ ...venue, score: scoreVenue(venue, answers) }))
    .sort((a, b) => b.score - a.score || (b.capacity_max ?? 0) - (a.capacity_max ?? 0));

  if (exactMatches.length > 0) {
    return {
      mode: exactMatches.length >= 4 ? "exact" : "narrow",
      venues: exactMatches.slice(0, 4),
    };
  }

  const closest: RankedVenue[] = eligible
    .map((venue) => ({ venue, score: scoreVenue(venue, answers), penalty: closestPenalty(venue, answers) }))
    .sort((a, b) => a.penalty - b.penalty || b.score - a.score)
    .slice(0, 4)
    .map(({ venue, score }) => ({ ...venue, score }));

  return { mode: "closest", venues: closest };
}

export function buildSummary(venue: RankedVenue, answers: QuizAnswers): string {
  const reasons: string[] = [];
  const perks = answers.perks ?? [];

  if (matchesVibe(venue, answers.vibe)) {
    reasons.push(`the ${stylePhrase(answers.vibe)} you selected`);
  }
  if (answers.setting === "both" && venue.outdoor_support === "yes" && venue.indoor_support !== "no") {
    reasons.push("outdoor beauty with a real indoor option");
  } else if (answers.setting === "outdoor" && venue.outdoor_support === "yes") {
    reasons.push("an outdoor-focused experience");
  } else if (answers.setting === "indoor" && venue.indoor_support === "yes") {
    reasons.push("a strong indoor event space");
  }
  if (answers.guestCount === "up-to-50" && venue.micro_wedding_fit) {
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

  const note = venue.photo_notes || venue.best_for || "";
  return `${venue.name} rose to the top because it pairs ${joined}.${note ? ` ${note}` : ""}`;
}

export function buildDisplayTags(venue: RankedVenue, answers: QuizAnswers): string[] {
  const labels: string[] = [];
  const perks = answers.perks ?? [];
  if (matchesVibe(venue, answers.vibe)) labels.push(stylePhrase(answers.vibe));
  if (answers.guestCount === "up-to-50" && venue.micro_wedding_fit) labels.push("micro wedding fit");
  if (venue.weather_backup === "yes" && (answers.setting === "both" || perks.includes("weather"))) labels.push("weather backup");
  if (venue.overnight_accommodation === "yes" && perks.includes("lodging")) labels.push("overnight stay");
  if (isAllInclusiveVenue(venue) && (perks.includes("allInclusive") || answers.planning === "allInclusive")) labels.push("guided planning");
  if (labels.length === 0) labels.push("strong overall fit");
  return labels.slice(0, 4);
}

// Internal keys must match api/lib/tags.ts's KIT_TAG_NAMES map.
export function deriveKitTagKeys(venue: RankedVenue): string[] {
  const keys: string[] = [];
  if (venue.garden_flag) keys.push("garden");
  if (venue.historic_flag) keys.push("historic");
  if (venue.european_flag) keys.push("european");
  if (venue.micro_wedding_fit) keys.push("microWedding");
  if (venue.source_type_tags.some((tag) => tag.toLowerCase().includes("museum"))) keys.push("museum");
  if (venue.source_type_tags.some((tag) => tag.toLowerCase().includes("spotlight"))) keys.push("spotlight");
  if (venue.budget_buckets.includes("under-2k")) keys.push("budgetUnder2k");
  if (venue.budget_buckets.includes("under-5k")) keys.push("budgetUnder5k");
  const vibeText = (venue.primary_vibe ?? "").toLowerCase();
  if (vibeText.includes("rustic")) keys.push("rustic");
  if (vibeText.includes("modern")) keys.push("modern");
  if (vibeText.includes("lakeside") || vibeText.includes("lakefront")) keys.push("lakefront");
  if (venue.overnight_accommodation === "yes") keys.push("lodging");
  return Array.from(new Set(keys));
}
