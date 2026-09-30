# Wedding Venue Quiz: Current Implementation Plan

## Purpose

Launch a 10-question Orlando wedding venue quiz on `authormadephoto.com`. The Squarespace page supplies the site's native header/footer and embeds the quiz from Vercel. Matching is deterministic and driven by the venue spreadsheet; Kit eventually receives the subscriber and one final venue/vibe segment tag.

This document reflects the currently agreed architecture and Amy's Asana comments. Older Supabase/database proposals are retired: submission history and reporting are not required.

## Phase 0: Prove the quiz works (current)

The immediate goal is a deployable Vercel project that answers one question: **does the quiz flow and the matching engine actually work against real venue data?** Two dependencies are therefore deferred rather than configured up front.

| Concern | Phase 0 (now) | Production target |
|---|---|---|
| Venue data | `data/venues.csv`, committed to the repo and read from disk | Published Google Sheet CSV, fetched and cached |
| Kit sync | Off. No API key, no subscriber, no tags | Kit v4 upsert plus one segment tag |
| Env vars | None required | `KIT_API_KEY`, `VENUE_SHEET_CSV_URL` |
| Audience | Amy and Michael only, unlinked/protected deploy | Public Squarespace page |

Both deferrals are switch-flips, not rewrites:

- **Venue data.** `api/lib/venueSource.ts` reads `data/venues.csv` when `VENUE_SHEET_CSV_URL` is unset. Setting that variable switches the same parser to the published sheet with no code change. `vercel.json` uses `functions.includeFiles` so the CSV is bundled into the serverless function. In Phase 0, changing venue data means editing the CSV and redeploying.
- **Kit.** `api/match.ts` runs the Kit sync only when `KIT_API_KEY` is present. With no key it logs that the sync was skipped, returns `kitSync: "skipped"` in the response, and the visitor still gets a full result.

**Consequence to keep in view:** the quiz still asks for email and consent before showing results, but with Kit off that email goes nowhere and is not stored. Use test addresses during Phase 0, and do not drive real traffic to the deploy until Kit is connected, or those signups are lost silently.

## Current Architecture

```text
Squarespace /venue-quiz (or popup deep link)
  -> Code Block iframe
    -> Vercel static frontend: embed-app.html
      -> POST /api/match
        -> venue CSV: committed data/venues.csv, or published sheet when configured
        -> normalize rows and exclude incomplete/inactive venues
        -> apply hard filters, dealbreakers, and weighted ranking
        -> upsert subscriber and apply one final segment tag in Kit (when enabled)
        -> return top match, three runners-up, reasons, and caveats
```

### Components

- **Squarespace**: host page, existing site navigation/footer, popup or CTA entry point.
- **Vercel**: static frontend, `/api/match` serverless function, environment variables, deployment.
- **Venue CSV**: single source of truth for venue data. Phase 0 reads the committed `data/venues.csv`. Production switches to a published Google Sheet CSV, cached for roughly five minutes per warm function instance. Either way there is no manual import endpoint and no database.
- **Kit** (deferred): subscriber record, final quiz segment tag, and welcome sequence.
- **No Supabase**: no database, submission history, or reporting in v1.

## Repository Reference

- `embed-app.html` — frontend and 10-question flow.
- `data/venues.csv` — committed copy of the 41-row venue dataset; the Phase 0 data source.
- `api/match.ts` — request validation, venue loading, ranking, optional Kit sync, result response.
- `api/lib/venueSource.ts` — loads the CSV from disk, or fetches/caches the published sheet when `VENUE_SHEET_CSV_URL` is set.
- `api/lib/importVenues.ts` — CSV column mapping and field normalization.
- `api/lib/normalize.ts` — budget, capacity, enum, and text normalization helpers.
- `api/lib/ranking.ts` — hard filters, dealbreakers, ranking, explanations, tag derivation.
- `api/lib/kit.ts` — Kit API v4 calls.
- `api/lib/tags.ts` — controlled internal-to-Kit tag mapping.
- `Author_Made_Venue_Quiz_Database_09.10.2026.xlsx - Venue Database.csv` — original export the committed `data/venues.csv` was copied from.
- `squarespace-embed-preview.html` — local host-page/iframe design harness; not a production embed.
- `README.md` — developer reference and setup guide.
- `question-to-field-mapping.md` — older mapping document; update it to this plan before implementation is considered complete.

## Confirmed Product Decisions

- Keep **10 quiz questions**.
- Keep the existing overall visual direction, but streamline the quiz interior as requested.
- Results appear on the site immediately after email and consent submission.
- Use deterministic rules and weighted scoring, not an LLM in the ranking path.
- Budget, capacity, ceremony/reception structure, and explicit dealbreakers are hard constraints.
- Geography is a preference, not a hard filter.
- Q7 changes from micro-wedding status to dealbreakers. Guest count plus the venue's `Micro-Wedding Fit` field already carries the micro-wedding signal.
- Do not treat blank/unknown venue data as an explicit `No`.
- Return one top venue and three runners-up when available.
- Use Kit as the only subscriber/tag store; no quiz submission database is needed.

## Ten-Question Contract

| # | Question / answer concept | CSV fields | Matching role |
|---|---|---|---|
| 1 | Venue vision/style | `Primary Style / Vibe`; supporting `Photography / Visual Notes`, `Best For / Couple Type` | Strong scoring. The slash-separated values are ordered: first tag is the venue's primary style, second/third are weaker fits. |
| 2 | Expected guest count | `Max. Guest Capacity`; `Micro-Wedding Fit`; `Indoor`; `Outdoor` | Hard capacity constraint. Interpret capacity in the context of the selected setting: do not flatten `80 seated indoor; 150+ outdoor` into a universal capacity of 150. |
| 3 | Venue rental budget | `Under $2k?`; `Under $5k?`; `Starting Price (numeric)`; `Price Notes / Caveats`; `Pricing Data Date` | Hard budget eligibility, but flags must represent a realistic option for the couple's selected format/guest count, not merely a low headline starting price. Include rental-only scope and pricing-change disclaimers. |
| 4 | Ceremony + reception structure | `Ceremony + Reception?`; `Reception Only?` | Hard structural constraint when the couple has a firm format. Unknown is not a pass or a fail; resolve unknowns in the dataset or exclude from that format's eligible pool. |
| 5 | Indoor/outdoor preference | `Indoor`; `Outdoor`; `Weather Backup` | Strong score. Give meaningful weight to an indoor contingency for Florida weather. A selected preference is not a hard filter unless the user marks it as a dealbreaker. |
| 6 | Geographic preference | `City / Area` | Medium/low score. “Anywhere” has minimal influence. Geography must not outweigh budget, capacity, format, or a much stronger overall fit. |
| 7 | What would you rather not have? | Needs a controlled `Dealbreaker Traits` field, supplemented by `Not Ideal For`, `Primary Style / Vibe`, `Indoor`, `Outdoor`, `Outside Vendors` | Negative preference. Eliminate for explicit non-negotiables when evidence is clear; otherwise apply a very large penalty. Include “None of these / I'm open.” |
| 8 | Desired venue features (multi-select) | `Weather Backup`; `Photography / Visual Notes`; `Getting Ready`; `Overnight Accommodation`; `Outside Vendors`; `Catering` | Medium scoring. Photo potential and weather backup are meaningful fit factors, not throwaway extras. Unknown fields provide neither a bonus nor a penalty. |
| 9 | Planning style | Needs controlled `Planning Style Fit` field; supporting `Catering`, `Outside Vendors`, `Price Notes / Caveats` | Medium scoring: guided/supported, flexible/personal, or both. Do not infer from vague catering prose when the field is unknown. |
| 10 | Top priority | `Primary Style / Vibe`; `Photography / Visual Notes`; `Best For / Couple Type`; budget/capacity/feature fields | Tie-breaker/personalization only. Never overrides a hard constraint. |

### Q3 Budget copy and interpretation

Question copy should state that this is **venue rental only**, not catering, vendors, or total wedding cost. Add a results disclaimer that prices are research-based estimates and may change.

`Under $2k?` / `Under $5k?` flags are candidate filters, not proof that every package works. For example, a ceremony-only price does not establish that a ceremony-and-reception package for the selected guest count fits. Use `Price Notes / Caveats` and event format to validate the option. If the spreadsheet cannot establish a realistic fit, leave the budget eligibility unknown and exclude the venue from that budget-specific exact-match pool rather than guessing.

### Q7 Dealbreaker data

The finalized CSV currently has no structured dealbreaker column. Add a controlled multi-value column, recommended header `Dealbreaker Traits`, with values from a stable vocabulary such as:

- `rustic-barn`
- `formal-ballroom`
- `museum-modern`
- `historic-old-world`
- `primarily-outdoor`
- `far-from-orlando`
- `vendor-restrictions`

A user can select multiple dealbreakers or select “None of these / I'm open.” Store explicit positive venue traits only when evidence supports them. Do not generate values solely from a venue name.

### Atmosphere/scale within 10 questions

Amy's Asana notes called out atmosphere/scale as distinct from guest count. To keep 10 questions, represent that intent in Q1's venue-vision choices rather than adding an eleventh question. The style options can be refined to carry emotional scale (cozy/intimate, elegant but intimate, lively/social, grand/statement-making, relaxed/casual) while retaining a clear mapping to ordered venue style tags. Q2 remains the numeric guest-count constraint.

## Matching Algorithm

### Stage 1: Validate the request

- Accept only `POST /api/match`.
- Require a syntactically valid email and explicit consent.
- Validate answer values against the controlled question option IDs; reject unknown IDs rather than silently score them.

### Stage 2: Normalize and establish eligibility

- Parse the current published CSV using the finalized headers.
- Normalize `Yes`, `No`, `Some`, `Limited`, “unknown”, and blank distinctly.
- Parse capacity into context-aware capacity information; preserve indoor/outdoor distinctions where the source states them.
- Normalize the two budget flags, including ambiguous values (`Unknown; likely yes`, `Unclear`, `N/A; assume no`) as unknown, not yes/no.
- Keep only venues with sufficient researched values for the selected hard constraints. `Research Status = Needs research`, `Verification Needed? = Yes`, and explicit missing hard-filter facts should make a venue ineligible for launch matching until reviewed.

### Stage 3: Apply hard filters

1. Capacity supports the guest count in the requested event setting.
2. Budget has a documented realistic venue-rental option for the selected budget, guest count, and event format.
3. Ceremony/reception arrangement supports the requested structure.
4. Explicit dealbreakers do not conflict with established venue traits.

Do not relax these hard filters just to force four results. If fewer than four venues survive, show the real smaller shortlist. If none survive, show a closest-match set with a clear explanation of which constraint(s) need flexibility.

### Stage 4: Score surviving venues

Initial relative weights (sum to 100); tune through influence QA, not by intuition alone:

| Factor | Weight | Rule |
|---|---:|---|
| Vision/style | 30 | Exact ordered style match: primary tag 30, secondary 20, tertiary 10; no match 0. |
| Indoor/outdoor fit | 20 | Fit against `Indoor`, `Outdoor`, and `Weather Backup`; unknown gets no bonus. |
| Atmosphere/scale | 15 | Fit from the Q1 answer and structured venue traits. |
| Requested features | 15 | Distribute across selected supported feature flags; unknown gets no bonus. |
| Planning style | 10 | Compare answer with controlled `Planning Style Fit`; unknown gets no bonus. |
| Geography | 5 | Match user's area; if “Anywhere,” score all equally/minimally. |
| Final priority | 5 | Tie-breaker only, using a supported venue field. |

Dealbreaker conflicts are evaluated before ordinary scoring: explicit conflicts eliminate; well-supported but non-explicit conflicts receive a very large penalty. A large total score can never compensate for failing a hard filter.

### Stage 5: Return personalized results

Return:

- #1 venue name
- concise explanation tied to 2–4 specific quiz answers
- one material caveat supported by the spreadsheet, when available
- up to 3 runners-up, with why each fits and the principal reason it ranked below #1
- result mode (`exact`, `narrow`, or `closest`) and a disclaimer when relevant

Do not claim a match score is a probability or imply certainty. Never invent venue features or pricing.

## CSV Contract and Current Gaps

The current CSV contains 41 venue rows and the new headers `Under $2k?` and `Under $5k?`.

**Resolved:** the importer previously referenced retired headers (`Price / Budget Fit`, `Garden / Botanical`, `Historic`, `European / Old-World`). Against the 09.10.2026 CSV that made every venue launch-ineligible, so the quiz returned no results at all. `api/lib/importVenues.ts` now reads the two budget flag columns, and derives the garden/historic/old-world traits from the `Primary Style / Vibe` vocabulary, where they now live. With that fix, 39 of 41 venues are launch-eligible and all tested personas return a ranked shortlist.

Hedged budget values (`Unclear; likely yes`, `Unknown; likely yes`, `N/A; assume no`) and format-qualified ones (`Yes (ceremony only)`) resolve to **unknown**, per the Q3 rule below: they keep a venue out of that budget bucket rather than being guessed into a `Yes`. Two venues (Bella Cosa, Bynx Café) are currently excluded entirely because both their budget flags are blank or hedged.

Before launch, confirm/add:

1. `Dealbreaker Traits` — controlled, multi-value tags.
2. `Planning Style Fit` — controlled values: `guided`, `flexible`, `both`, `unknown`.
3. Budget-flag semantics — whether “Yes” guarantees at least one realistic option for each event format/guest range, or only that some package starts in that tier. If the latter, add explicit budget/event-format caveat values.
4. Capacity semantics for mixed layouts — preserve indoor and outdoor seated limits when given.
5. Eligibility policy — current data has 12 `Needs research`, one blank research status, and ambiguous budget/micro-wedding values. Confirm these are excluded from normal recommendations until reviewed. Note that `Verification Needed?` is `Yes` on all 41 rows, so it cannot be used as an exclusion rule as written; either the column needs real per-venue values or the rule needs to rest on `Research Status` instead.
6. Ordered style vocabulary — allowed values must exactly match Q1 options; keep spreadsheet order authoritative.

## Kit Integration (deferred to Phase 3b)

Kit is switched off for Phase 0. `api/match.ts` runs the sync only when `KIT_API_KEY` is set; the client and tag-mapping code (`api/lib/kit.ts`, `api/lib/tags.ts`) stay in the repo unchanged and inert. When the key is added, the rules below apply.

- Keep Kit API v4 key server-side in `KIT_API_KEY`.
- Upsert subscriber by email only after the visitor submits the consented form.
- Assign **one final segment tag** for the welcome/drip sequence, based on the top venue's primary ordered style tag (and the agreed courthouse wedding category if applicable). Do not attach every venue taxonomy tag as subscriber segments.
- Confirm the exact six Kit tag names Amy intends to use (five venue/vibe tags plus courthouse wedding) and map them in `api/lib/tags.ts`.
- Optional Kit custom fields may store the top venue, result mode, budget band, and guest-count band if those fields exist in Kit; they are not a substitute for additional segment tags.
- If Kit is temporarily unavailable, return the venue result and log the sync failure server-side. Because no submission store exists, do not claim a failed Kit sync can be retried from a database.

## Vercel Deployment Plan

### Environment variables

**Phase 0 requires none.** The project deploys and runs with an empty environment.

| Variable | When | Purpose |
|---|---|---|
| `KIT_API_KEY` | Phase 3b | Enables the Kit sync. Absent means no subscriber and no tags. |
| `VENUE_SHEET_CSV_URL` | Phase 3b | Switches venue data from `data/venues.csv` to the published sheet. |
| `VERCEL_APP_PASSWORD` | Phase 0 | Only if deployment protection is used to keep the test deploy private. |

### Phase 0 deployment steps

1. Create/import the GitHub repository in Vercel using the **Other** framework preset.
2. Set no environment variables. Turn **Deployment Protection** on so the test deploy is not publicly reachable.
3. Deploy static `embed-app.html` plus `api/match.ts`, the shared `api/lib` modules, and `data/venues.csv`.
4. Open the deployment URL directly and complete the quiz end to end.
5. Confirm `/api/match` returns a ranked venue and `kitSync: "skipped"`, and that the function log shows the venue CSV loading from the static file.
6. Run the Phase 4 persona cases against the deployed endpoint and review the results with Amy.

No build step, database, or external service is required. `vercel.json` bundles `data/**` into the function via `functions.includeFiles`.

### Later deployment steps (before public launch)

1. Publish the Google Sheet to web as CSV and confirm the URL returns CSV, not an HTML sign-in page. Google Sheets publish-to-web makes the sheet public by URL, so it must contain only intended venue data.
2. Set `VENUE_SHEET_CSV_URL` and redeploy. Venue data then propagates within the roughly five-minute in-memory cache window per warm instance; cold instances fetch current sheet data.
3. Set `KIT_API_KEY` and verify Kit creates/updates and tags a test subscriber.
4. Add a Content-Security-Policy `frame-ancestors` rule permitting `https://www.authormadephoto.com` and no unrelated embedding origins. This is not yet in `vercel.json`; leaving it off during Phase 0 is what allows local and preview framing.
5. Configure the Squarespace Code Block iframe to the Vercel URL. Keep the event-origin check in the parent `message` handler set to the exact deployed origin.

## Squarespace User Path and Embed

### Direct page path

A visitor clicks a site navigation/blog link to `/venue-quiz`, sees the hero/context screen, then clicks “Find My Venue Match” to begin question 1.

### Popup path

A scroll-triggered popup can link to `/venue-quiz?start=1` to skip the intro CTA and land directly on question 1. Keep the plain `/venue-quiz` link for direct navigation so those visitors see the intro first.

### Page implementation

- Create the Squarespace `/venue-quiz` page with the normal site header/footer.
- Use a Code Block containing a responsive iframe pointing at the Vercel deployment.
- Use the existing `postMessage` height handshake to size the iframe to `#app` content; do not leave a fixed 900px height in production other than an initial fallback.
- Test intro, question, email, and result screens on desktop/mobile for no internal iframe scrollbar, no dead space, and centered/cropped hero photography.

## Implementation Phases

### Phase 0: Working test deploy (current)

- Commit `data/venues.csv` and read venue data from it by default. **Done.**
- Make the Kit sync conditional on `KIT_API_KEY`. **Done.**
- Fix the retired CSV header mappings so matching returns real venues. **Done.**
- Create the Vercel project with protection on and no environment variables. **Next.**
- Walk the full quiz on the deployed URL and review output quality with Amy.

### Phase 1: Data contract

- Align `api/lib/importVenues.ts` and `api/lib/normalize.ts` to the finalized 09.10.2026 CSV headers. **Done for budget flags and style-derived traits; ordered style tags still pending.**
- Add ordered style-tag parsing.
- Add structured dealbreaker and planning-style fields to the sheet, or explicitly decide to defer those fields and disable related hard filtering until present.
- Resolve budget-flag semantics and mixed-layout capacity handling.
- Set active eligibility rules for needs-research / verification-required rows.

### Phase 2: Ten-question frontend alignment

- Keep 10 questions.
- Replace Q7 micro-wedding question with the agreed dealbreaker question.
- Retain micro-wedding fit as a venue attribute and use it in Q1 atmosphere/scale, Q2 capacity fit, or Q8 features without adding a question.
- Add venue-rental-only explanation to Q3 and pricing-estimate caveat to results.
- Validate that submitted question IDs exactly match the backend's answer schema.

### Phase 3a: Ranking

- Implement the hard-filter order and weighted scoring above.
- Add explicit unknown-state behavior and closest-match reason codes.
- Update result payload to include top explanation, caveat, and runner-up differentiation.

### Phase 3b: Live data and Kit

- Move venue data to the published sheet by setting `VENUE_SHEET_CSV_URL`.
- Confirm the final six Kit segment tag labels with Amy.
- Implement one final Kit segment tag mapping based on the top venue's primary ordered style.
- Set `KIT_API_KEY` and verify a test subscriber is created and tagged.

### Phase 4: Influence QA

- Create expected-result personas for small garden, large indoor, under-$2k, ceremony-only, vendor-flexible, geographically flexible, and dealbreaker cases.
- Run every case through the real 41-row data.
- Fix spreadsheet tags or matching rules where results violate the intended hierarchy.
- Re-run TypeScript checks and full local `?mock=1` UI flow.

### Phase 5: Embed and launch

- Deploy and exercise `/api/match` against real data.
- Add/verify frame-ancestors CSP.
- Add Squarespace iframe and test the direct page and popup deep link on desktop/mobile.
- Soft-launch unlinked, QA with Amy, then add site navigation/popup links.

## Acceptance Checklist

- Ten questions, under three minutes for a typical visitor.
- Email and explicit consent are required before results are returned.
- Guest count, realistic budget, event structure, and explicit dealbreakers are not overridden by soft preferences.
- Geography is a preference; “Anywhere” has minimal impact.
- Ordered primary/secondary/tertiary style tags influence ranking in that order.
- Unknown data is not treated as “No.”
- Incomplete/unverified venues are excluded according to the agreed eligibility rule.
- Results include one top venue and up to three actual runners-up without forcing invalid matches.
- Explanation references supported quiz answers; caveats use source data and do not invent facts.
- Kit receives one agreed segment tag, not a pile of overlapping venue tags.
- The Squarespace iframe resizes across all views and has no nested scrollbars/dead bands.

## Acceptance Checklist — Phase 0

The full checklist above is the launch bar. Phase 0 only has to clear this much:

- The Vercel project builds and serves the quiz frontend.
- A full 10-question run returns a top venue and runners-up from real data.
- No environment variables, no Kit account, and no published sheet are needed to get that far.
- Results are plausible enough for Amy to judge whether the matching logic is worth refining.

## Current Review Status

- **Approved:** deterministic ranking; 10 questions; Vercel + CSV + Kit; no submission history/reporting; Q7 is dealbreakers; hard filters precede scoring; ordered style tags; geography is a preference; top priority is a tie-breaker.
- **Implemented:** static repo-based venue data with an env-var switch to the published sheet; Kit sync gated on `KIT_API_KEY`; CSV parser mapped to the 09.10.2026 budget-flag and style columns; 39 of 41 venues launch-eligible; personas return ranked results.
- **Needs data-contract confirmation:** budget-flag meaning for specific ceremony/reception packages; mixed indoor/outdoor capacity representation; exact controlled dealbreaker and planning-style columns; final six Kit segment tag labels; eligibility of `Needs research` venues, and what to do about `Verification Needed?` being `Yes` on every row.
- **Not yet implemented:** ordered primary/secondary/tertiary style-tag parsing, Q7 replacement, the weighted hierarchy in the table above (current scoring is the older ported version), one-tag Kit segmentation, result caveat output, frame-ancestors CSP, Squarespace configuration.
