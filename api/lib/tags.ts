// Kit tag names, finalized in the "Email Launch Plan: Quiz to Kit" doc. Names must match the tags in
// Kit exactly (Kit matches case-insensitively, but keep the spelling identical so the welcome
// automations, which trigger on these tags, fire).

// The five venue styles. These are the exact words used in the venue sheet's "Primary Style / Vibe"
// column, so a venue's first listed style maps straight to a tag.
export const STYLE_TAG_NAMES = [
  "Garden Romance",
  "Old-World Character",
  "Modern + Editorial",
  "Relaxed + Rustic",
  "Classic Elegance",
] as const;

export type StyleTagName = (typeof STYLE_TAG_NAMES)[number];

// Added to everyone who submits the quiz with consent.
export const QUIZ_TAKER_TAG = "Quiz taker";

// Kit custom fields (already created in the account).
export const KIT_FIELD_KEYS = {
  topStyle: "top_style",
  quizResults: "quiz_results",
  weddingDate: "wedding_date",
  signupSource: "signup_source",
} as const;

// A venue's top style is the FIRST style in its "Primary Style / Vibe" cell, e.g.
// "Garden Romance / Classic Elegance / Old-World Character" -> "Garden Romance".
export function topStyleForVenue(primaryVibe: string | null | undefined): StyleTagName | null {
  const first = (primaryVibe ?? "").split("/")[0]?.trim().toLowerCase();
  if (!first) return null;
  return STYLE_TAG_NAMES.find((name) => name.toLowerCase() === first) ?? null;
}
