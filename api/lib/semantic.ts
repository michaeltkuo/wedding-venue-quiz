import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import type { QuizAnswers, VenueRow } from "./types";

// Semantic similarity between the wording of a couple's "feel" answers and the venue sheet's free text.
//
// Opt-in with RANKING_MODE=semantic. Vectors are precomputed offline by `npm run embed` (a sentence
// embedding model run on this machine, see scripts/embeddings/) and committed to
// data/venue-embeddings.json, so the serverless function only does dot products: no model download,
// no API key, no extra latency, and the same answers always give the same result.
//
// Only answers about how the venue should FEEL use similarity. Logistics (budget, guests, setting,
// catering, lodging, weather backup, location) stay rule-based on the sheet's columns: the research
// in docs/ranking-research.md found that answer wording cannot recover those from venue text.

export const EMBEDDINGS_PATH = join(process.cwd(), "data", "venue-embeddings.json");

// Which answers are embedded and used. "all" = every option of that question. Changing this needs a
// re-run of `npm run embed`; tests/semantic.test.ts fails until the committed vectors match.
export const FEEL_ANSWERS: Record<string, "all" | string[]> = {
  vibe: "all",
  priority: ["photos", "unique"],
  perks: ["photos"],
};

// Most points similarity can add (the best-matching venue in the pool gets all of it, the weakest
// gets 0). It replaces the rule-based "photos"/"unique" bonuses, which were worth up to 16, and adds
// nuance within a style group. Comparable to the format (15) and setting (15) weights.
export const SEMANTIC_WEIGHT = 20;

export interface EmbeddingEntry {
  // Hash of the exact text that was embedded; a mismatch means the text changed and the vector is stale.
  hash: string;
  vector: number[];
}

export interface SemanticIndex {
  model: string;
  answers: Record<string, EmbeddingEntry>;
  venues: Record<string, EmbeddingEntry>;
}

export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// "Not Ideal For" is left out on purpose: embeddings ignore negation, so "not ideal for couples
// wanting a garden" would read as garden-like.
export function semanticVenueText(venue: VenueRow): string {
  return [venue.photo_notes, venue.best_for, venue.top_match_description, venue.runners_up_description]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function semanticAnswerText(title: string, description: string): string {
  return `${title.trim()}. ${description.trim()}`;
}

export function isFeelAnswer(question: string, value: string): boolean {
  const allowed = FEEL_ANSWERS[question];
  return allowed === "all" || (Array.isArray(allowed) && allowed.includes(value));
}

// The "question:value" keys of the couple's answers that describe the venue's feel.
export function feelAnswerKeys(answers: QuizAnswers): string[] {
  const keys: string[] = [];
  if (answers.vibe && isFeelAnswer("vibe", answers.vibe)) keys.push(`vibe:${answers.vibe}`);
  if (answers.priority && isFeelAnswer("priority", answers.priority)) keys.push(`priority:${answers.priority}`);
  for (const perk of answers.perks ?? []) {
    if (isFeelAnswer("perks", perk)) keys.push(`perks:${perk}`);
  }
  return keys;
}

let cachedIndex: SemanticIndex | null = null;

export function loadSemanticIndex(path: string = EMBEDDINGS_PATH): SemanticIndex {
  if (cachedIndex && path === EMBEDDINGS_PATH) return cachedIndex;
  const index = JSON.parse(readFileSync(path, "utf8")) as SemanticIndex;
  if (path === EMBEDDINGS_PATH) cachedIndex = index;
  return index;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Vector for a venue, or null when it has none or its text changed since `npm run embed`
// (e.g. an edit in the published Google Sheet).
export function venueVector(index: SemanticIndex, venue: VenueRow): number[] | null {
  const entry = index.venues[venue.slug];
  if (!entry || entry.hash !== textHash(semanticVenueText(venue))) return null;
  return entry.vector;
}

// Mean cosine similarity (vectors are unit length) between the couple's feel answers and each venue,
// rescaled across the pool to 0..SEMANTIC_WEIGHT points. A venue without a usable vector sits at the
// midpoint so it is neither rewarded nor buried. Returns an empty map when no feel answer has a
// vector, which adds nothing to any venue.
export function semanticPoints(venues: VenueRow[], answers: QuizAnswers, index: SemanticIndex): Map<string, number> {
  const queries = feelAnswerKeys(answers)
    .map((key) => index.answers[key]?.vector)
    .filter((vector): vector is number[] => Array.isArray(vector));
  const points = new Map<string, number>();
  if (queries.length === 0) return points;

  const similarities = venues.map((venue) => {
    const vector = venueVector(index, venue);
    if (!vector) return null;
    return queries.reduce((sum, query) => sum + dot(query, vector), 0) / queries.length;
  });
  const known = similarities.filter((value): value is number => value !== null);
  const min = Math.min(...known);
  const max = Math.max(...known);

  venues.forEach((venue, i) => {
    const similarity = similarities[i];
    const scaled = similarity === null || max === min ? 0.5 : (similarity - min) / (max - min);
    points.set(venue.slug, Math.round(scaled * SEMANTIC_WEIGHT * 100) / 100);
  });
  return points;
}
