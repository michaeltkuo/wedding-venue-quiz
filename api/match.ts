import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getVenues } from "./lib/venueSource";
import { buildDisplayTags, buildSummary, rankVenues } from "./lib/ranking";
import { syncQuizSignup } from "./lib/kit";
import { topStyleForVenue } from "./lib/tags";
import { loadSemanticIndex, type SemanticIndex } from "./lib/semantic";
import type { MatchRequestBody } from "./lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEDDING_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/; // <input type="month"> value
const SOURCE_PATTERN = /^[A-Za-z0-9._~-]{1,100}$/; // a blog-post slug from ?src=

// RANKING_MODE=semantic turns on similarity scoring for the "feel" answers (api/lib/semantic.ts).
// Unset, or if the embeddings file cannot be read, ranking uses the rule-based score.
function semanticIndexForRequest(): SemanticIndex | null {
  if (process.env.RANKING_MODE !== "semantic") return null;
  try {
    return loadSemanticIndex();
  } catch (error) {
    console.error("Semantic ranking unavailable; using rule-based scoring", error);
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface ResultLine {
  name: string;
  note: string | null | undefined;
  url: string | null | undefined;
}

// Simple HTML saved to the Kit quiz_results field; welcome email #1 inserts it.
function buildQuizResultsHtml(top: ResultLine, runnersUp: ResultLine[]): string {
  const item = (line: ResultLine) => {
    const name = line.url
      ? `<a href="${escapeHtml(line.url)}">${escapeHtml(line.name)}</a>`
      : escapeHtml(line.name);
    return `<p><strong>${name}</strong>${line.note ? `<br>${escapeHtml(line.note)}` : ""}</p>`;
  };
  return [item(top), ...runnersUp.map(item)].join("");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as MatchRequestBody | undefined;
  const email = body?.email?.trim();
  const consent = body?.consent === true;
  const answers = body?.answers ?? {};

  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: "A valid email address is required." });
  }
  if (!consent) {
    return res.status(400).json({ error: "Marketing consent is required before results can be shown." });
  }

  let venues;
  try {
    ({ venues } = await getVenues());
  } catch (error) {
    console.error("Failed to load venues", error);
    return res.status(500).json({ error: "Could not load venue data." });
  }

  const semanticIndex = semanticIndexForRequest();
  const result = rankVenues(venues.filter((venue) => venue.launch_eligible), answers, semanticIndex);
  const [topVenue, ...runnerVenues] = result.venues;

  if (!topVenue) {
    return res.status(200).json({
      resultMode: "closest",
      topVenue: null,
      runnersUp: [],
      tags: [],
      runnersUpDisclaimer: "No venues are currently marked launch-ready. Please check back soon.",
    });
  }

  const firstName = typeof body?.firstName === "string" ? body.firstName.trim().slice(0, 60) : "";
  const weddingDate = typeof body?.weddingDate === "string" && WEDDING_DATE_PATTERN.test(body.weddingDate) ? body.weddingDate : "";
  const signupSource = typeof body?.source === "string" && SOURCE_PATTERN.test(body.source) ? body.source : "";

  // Kit is opt-in: with no KIT_API_KEY configured the quiz runs end to end without it. Setting the
  // key is all that is needed to turn the sync on.
  let kitSync: "ok" | "failed" | "skipped" = "skipped";

  if (process.env.KIT_API_KEY) {
    try {
      await syncQuizSignup({
        email,
        firstName: firstName || undefined,
        weddingDate: weddingDate || undefined,
        signupSource: signupSource || undefined,
        topStyle: topStyleForVenue(topVenue.primary_vibe),
        quizResultsHtml: buildQuizResultsHtml(
          {
            name: topVenue.name,
            note: buildSummary(topVenue, answers),
            url: topVenue.review_url || topVenue.source_url,
          },
          runnerVenues.map((venue) => ({
            name: venue.name,
            note: venue.runners_up_description || venue.photo_notes || venue.best_for,
            url: venue.review_url || venue.source_url,
          }))
        ),
      });
      kitSync = "ok";
    } catch (error) {
      // Never block the visitor's result on a Kit outage.
      console.error("Kit sync failed", error);
      kitSync = "failed";
    }
  } else {
    // No subscriber store is configured, so the submitted email is used for nothing and not retained.
    console.info("Kit sync skipped: KIT_API_KEY is not set");
  }

  // Shown on the runners-up section only (never on the top match), and only when a shown venue misses
  // a requirement. Wording from Amy's Nov 18 QC note.
  const runnersUpDisclaimer = result.someMissRequirements
    ? "Your responses narrowed down our list quite a bit, so some of these venues may not meet all your chosen requirements. We think they're still worth a consideration anyway."
    : null;

  return res.status(200).json({
    resultMode: result.mode,
    topVenue: {
      id: topVenue.id,
      name: topVenue.name,
      heroImageUrl: topVenue.hero_image_url,
      url: topVenue.review_url || topVenue.source_url,
      reviewUrl: topVenue.review_url,
      summary: buildSummary(topVenue, answers),
      score: topVenue.score,
    },
    runnersUp: runnerVenues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      city: venue.city_area,
      note: venue.runners_up_description || venue.photo_notes || venue.best_for,
      heroImageUrl: venue.hero_image_url,
      url: venue.review_url || venue.source_url,
      score: venue.score,
    })),
    tags: buildDisplayTags(topVenue, answers),
    runnersUpDisclaimer,
    kitSync,
    rankingMode: semanticIndex ? "semantic" : "rules",
  });
}
