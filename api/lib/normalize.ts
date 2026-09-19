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
  eligible: boolean;
}

export function normalizeBudget(rawLabel: string | null | undefined): BudgetResult {
  const label = (rawLabel ?? "").trim().toLowerCase();
  if (!label || label.includes("tbd") || label.includes("not established")) {
    return { buckets: [], eligible: false };
  }
  const buckets: string[] = [];
  if (label.includes("under $2k") || label.includes("under $2,000")) buckets.push("under-2k");
  if (label.includes("under $5k") || label.includes("under $5,000")) buckets.push("under-5k");
  // A stated label with no recognized bucket (e.g. "Over $5k", "Custom quote") is still eligible
  // for the "flexible" budget answer, just not for the under-2k/under-5k hard filters.
  return { buckets, eligible: true };
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
