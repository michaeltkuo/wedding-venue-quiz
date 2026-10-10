import type { TriState } from "./types";

// City/area text -> quiz location-question bucket. Extend as new cities appear in the sheet.
const REGION_BY_CITY: Record<string, string> = {
  "orlando": "orlando",
  "winter park": "winter-park",
  "maitland": "winter-park",
  "st. cloud": "south",
  "st cloud": "south",
  "kissimmee": "south",
  "lake mary": "north",
  "apopka": "north",
  "mount dora": "north",
  "eustis": "north",
  "tavares": "north",
  "howey-in-the-hills": "north",
  "deland": "east",
  "daytona beach": "east",
  "port orange": "east",
  "mims": "east",
};

export function deriveRegion(cityArea: string | null | undefined): string {
  if (!cityArea) return "unknown";
  return REGION_BY_CITY[cityArea.trim().toLowerCase()] ?? "unknown";
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface BudgetResult {
  buckets: string[];
  label: string | null;
  eligible: boolean;
}

// The sheet's two budget columns hold more than Yes/No. Per implementation-plan.md's Q3 rules,
// hedged values ("Unclear; likely yes", "N/A; assume no") and qualified ones ("Yes (ceremony only)")
// are NOT evidence that a realistic package exists at that tier, so they resolve to "unknown" and
// keep the venue out of that budget bucket instead of being guessed into a Yes.
export type BudgetFlag = "yes" | "no" | "unknown";

export function normalizeBudgetFlag(raw: string | null | undefined): BudgetFlag {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return "unknown";
  if (/unclear|unknown|assume|likely|tbd|n\/a|varies/.test(text)) return "unknown";
  // A parenthetical qualifier ("Yes (ceremony only)") scopes the price to one event format.
  if (text.startsWith("yes") && text.includes("(")) return "unknown";
  if (text.startsWith("yes")) return "yes";
  if (text.startsWith("no")) return "no";
  return "unknown";
}

export function normalizeBudget(rawUnder2k: string | null | undefined, rawUnder5k: string | null | undefined): BudgetResult {
  const under2k = normalizeBudgetFlag(rawUnder2k);
  const under5k = normalizeBudgetFlag(rawUnder5k);

  const buckets: string[] = [];
  if (under2k === "yes") buckets.push("under-2k");
  // Under $2k necessarily also clears the under-$5k tier.
  if (under5k === "yes" || under2k === "yes") buckets.push("under-5k");

  const label =
    buckets.includes("under-2k") ? "Under $2k"
    : buckets.includes("under-5k") ? "Under $5k"
    : under2k === "no" && under5k === "no" ? "Over $5k"
    : null;

  // Eligible means "we know something usable about this venue's price tier". Both flags unknown
  // (blank or hedged) leaves the venue out of matching until the sheet is corrected.
  const eligible = under2k !== "unknown" || under5k !== "unknown";

  return { buckets, label, eligible };
}

export interface CapacityResult {
  max: number | null;
  eligible: boolean;
}

export function normalizeCapacity(rawCapacity: string | null | undefined): CapacityResult {
  const text = (rawCapacity ?? "").trim();
  if (!text || /tbd/i.test(text)) return { max: null, eligible: false };
  if (/varies/i.test(text) && !/\d/.test(text)) return { max: null, eligible: false };
  const numbers = text.match(/\d+/g);
  if (!numbers || numbers.length === 0) return { max: null, eligible: false };
  return { max: Math.max(...numbers.map(Number)), eligible: true };
}

export function normalizeTriState(raw: string | null | undefined): TriState {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text || text.includes("not stated")) return "unknown";
  if (text.includes("limited") || text.includes("some") || text.includes("partial")) return "partial";
  if (text.startsWith("yes")) return "yes";
  if (text.startsWith("no")) return "no";
  return "unknown";
}

export function normalizeBoolean(raw: string | null | undefined): boolean {
  return (raw ?? "").trim().toLowerCase().startsWith("yes");
}

export function normalizeNumeric(raw: string | null | undefined): number | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const value = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function splitList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

// The Indoor column is free text ("Yes", "Yes (reception)", "Backup option", "No / limited"...).
// Couples read "indoor vs outdoor" mostly as the ceremony, so a venue whose indoor space is only for
// the reception, a rain backup, or getting ready counts as an outdoor-only ceremony. A dedicated
// "Ceremony setting" column in the sheet would replace this heuristic.
export function isOutdoorOnlyCeremony(indoorRaw: string | null | undefined): boolean {
  const text = (indoorRaw ?? "").trim().toLowerCase();
  if (!text || text.includes("not stated")) return false;
  if (text.startsWith("no") || text.startsWith("backup")) return true;
  return /\([^)]*\b(reception|backup|getting ready)/.test(text);
}

// The Catering column is free text. True only when it says the venue's own or approved caterer is
// required; packages with a DIY / bring-your-own option, "not required", and blank or "Not stated"
// (unknown, not "no") all stay false. An "Outside caterer allowed?" column would replace this.
export function requiresInHouseCatering(cateringRaw: string | null | undefined): boolean {
  const text = (cateringRaw ?? "").trim().toLowerCase();
  if (!text || text.includes("not stated") || /^(no|n\/a)\b/.test(text)) return false;
  if (/diy|not required|provide your own|outside cater|a la carte/.test(text)) return false;
  return /required|must use|exclusive|approved list|preferred (vendors|providers)|in-house/.test(text);
}
