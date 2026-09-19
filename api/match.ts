import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseClient } from "./lib/supabaseClient";
import { buildDisplayTags, buildSummary, deriveKitTagKeys, rankVenues } from "./lib/ranking";
import { tagSubscriberWithNames, upsertSubscriber } from "./lib/kit";
import { KIT_TAG_NAMES } from "./lib/tags";
import type { MatchRequestBody, VenueRow } from "./lib/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const supabase = getSupabaseClient();
  const { data: venues, error: venuesError } = await supabase
    .from("venues")
    .select("*")
    .eq("launch_eligible", true);

  if (venuesError) {
    console.error("Failed to load venues", venuesError);
    return res.status(500).json({ error: "Could not load venue data." });
  }

  const result = rankVenues((venues ?? []) as VenueRow[], answers);
  const [topVenue, ...runnerVenues] = result.venues;

  if (!topVenue) {
    return res.status(200).json({
      resultMode: "closest",
      topVenue: null,
      runnersUp: [],
      tags: [],
      disclaimer: "No venues are currently marked launch-ready. Please check back soon.",
    });
  }

  const kitTagNames = deriveKitTagKeys(topVenue)
    .map((key) => KIT_TAG_NAMES[key])
    .filter((name): name is string => Boolean(name));

  try {
    await upsertSubscriber(email, {
      quiz_top_venue: topVenue.name,
      quiz_result_mode: result.mode,
      quiz_budget_bucket: answers.budget ?? "",
      quiz_guest_range: answers.guestCount ?? "",
    });
    await tagSubscriberWithNames(email, kitTagNames);
  } catch (error) {
    // Never block the visitor's result on a Kit outage; the submission row below preserves the data for a retry.
    console.error("Kit sync failed", error);
  }

  const { error: submissionError } = await supabase.from("quiz_submissions").insert({
    email,
    consent,
    answers_json: answers,
    matched_venue_ids: result.venues.map((venue) => venue.id),
    top_venue_id: topVenue.id,
    kit_tags_json: kitTagNames,
    hard_filter_status: result.mode,
    result_mode: result.mode,
  });

  if (submissionError) {
    console.error("Failed to log quiz submission", submissionError);
  }

  const disclaimer =
    result.mode === "closest"
      ? "Your budget and guest-count filters did not produce an exact venue match in the launch-ready database. These are the closest venues to tour while you decide which must-have has the most flexibility."
      : result.mode === "narrow"
        ? "Your hard filters produced a very focused shortlist. The venues below are the matches that currently meet the budget and guest-count requirements you selected."
        : null;

  return res.status(200).json({
    resultMode: result.mode,
    topVenue: {
      id: topVenue.id,
      name: topVenue.name,
      heroImageUrl: topVenue.hero_image_url,
      url: topVenue.review_url || topVenue.source_url,
      summary: buildSummary(topVenue, answers),
      score: topVenue.score,
    },
    runnersUp: runnerVenues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      city: venue.city_area,
      note: venue.photo_notes || venue.best_for,
      url: venue.review_url || venue.source_url,
      score: venue.score,
    })),
    tags: buildDisplayTags(topVenue, answers),
    disclaimer,
  });
}
