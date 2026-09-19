# Wedding Venue Quiz Implementation Plan

## Goal

Build a rapid prototype of the Orlando wedding venue quiz using Squarespace as the presentation layer, Vercel for the frontend and API, and Supabase for structured data storage.

## Prototype Stack

- Squarespace page with code injection or iframe embed
- Vercel-hosted frontend app
- Vercel API routes for ranking and Kit integration
- Supabase Postgres for venue data and quiz submissions
- Kit API V4 for subscriber upsert and tagging

## Implementation Principles

- Keep ranking deterministic in v1.
- Keep all secrets server-side.
- Exclude incomplete venues from launch matching.
- Prefer iframe embedding first for stability inside Squarespace.
- Make data updates flow through imports, not code edits.

## Deliverables

1. Reviewable frontend quiz UI
2. Venue normalization pipeline from CSV into Supabase
3. Ranking API with hard filters and weighted scoring
4. Email capture flow with Kit tagging
5. Results page with top venue and three runners-up
6. Squarespace embed instructions

## System Architecture

### User Request Flow

1. Visitor opens a Squarespace page.
2. Squarespace embeds the quiz app from Vercel via iframe.
3. The quiz frontend loads questions and collects responses.
4. The user submits email and consent.
5. The frontend posts quiz data to a Vercel API route.
6. The API route validates the request.
7. The API route queries launch-eligible venues from Supabase.
8. The API route applies hard filters for budget and guest count.
9. The API route ranks remaining venues by weighted preferences.
10. The API route upserts the subscriber in Kit and applies normalized tags.
11. The API route stores the submission and result payload in Supabase.
12. The API route returns the result payload to the frontend.
13. The frontend renders the top venue, runners-up, and disclaimer if needed.

## Recommended Repository Structure

```text
app/
  src/
    components/
    screens/
    styles/
    lib/
  public/
  package.json
api/
  match.ts
  import-venues.ts
supabase/
  schema.sql
  seed/
docs/
  embed-notes.md
```

## Data Model

### Table: venues

- `id`
- `slug`
- `name`
- `city_area`
- `budget_label`
- `budget_min_bucket`
- `capacity_max`
- `indoor_support`
- `outdoor_support`
- `primary_vibe`
- `micro_wedding_fit`
- `garden_flag`
- `historic_flag`
- `european_flag`
- `source_type_tags`
- `source_url`
- `starting_price_numeric`
- `price_notes`
- `ceremony_reception`
- `reception_only`
- `weather_backup`
- `getting_ready`
- `overnight_accommodation`
- `catering`
- `outside_vendors`
- `photo_notes`
- `best_for`
- `not_ideal_for`
- `review_url`
- `last_verified`
- `verification_needed`
- `pricing_data_date`
- `research_status`
- `launch_eligible`
- `launch_ineligibility_reason`
- `hero_image_url`

### Table: quiz_submissions

- `id`
- `created_at`
- `email`
- `consent`
- `answers_json`
- `matched_venue_ids`
- `top_venue_id`
- `kit_tags_json`
- `hard_filter_status`
- `result_mode`

### Table: tag_mappings

- `id`
- `source_column`
- `source_value`
- `normalized_tag`
- `enabled`

## CSV Normalization Rules

### Launch Eligibility

Mark a venue as `launch_eligible = false` if any of the following are true:

- `Price / Budget Fit` is blank
- `Price / Budget Fit` contains `TBD`
- `Price / Budget Fit` contains `Not established`
- `Max. Guest Capacity` is blank
- `Max. Guest Capacity` contains `TBD`
- `Max. Guest Capacity` contains `Varies` with no usable upper bound

### Budget Normalization

Map CSV budget labels into internal buckets such as:

- `budget-under-2k`
- `budget-under-5k`
- `budget-over-5k`
- `budget-variable`

### Capacity Normalization

Normalize text values such as:

- `180` -> `180`
- `Up to 125` -> `125`
- `150+` -> `150`
- `80 seated indoor; 150+ outdoor` -> `150`

### Boolean Normalization

Map values like `Yes`, `Some`, `No`, `Not stated` into controlled internal enums:

- `yes`
- `partial`
- `no`
- `unknown`

## Initial Tag Vocabulary

- `garden`
- `historic`
- `european`
- `micro-wedding`
- `museum`
- `spotlight`
- `budget-under-2k`
- `budget-under-5k`
- `rustic`
- `modern`
- `lakefront`
- `lodging`

## Ranking Logic

### Hard Filters

Apply these first:

1. Budget bucket must match the user's selected budget rule.
2. Venue capacity must support the selected guest-count range.

### Weighted Scoring

Score remaining venues using a simple additive model.

Suggested weights:

- primary vibe match: 30
- indoor or outdoor fit: 15
- ceremony and reception format fit: 15
- location fit: 10
- micro wedding fit: 10
- special perks fit: 10
- source-type affinity such as garden, museum, spotlight: 10

### Result Modes

- `exact-match`: at least 4 venues pass hard filters
- `narrow-match`: 1 to 3 venues pass hard filters
- `closest-match`: 0 venues pass hard filters, so closest venues are shown with disclaimer

## API Design

### `POST /api/match`

Purpose:
Receive quiz answers, compute results, sync Kit tags, and return the payload.

Request:

```json
{
  "email": "user@example.com",
  "consent": true,
  "answers": {
    "vibe": ["romantic-garden"],
    "guestCount": "75-125",
    "budget": "under-5k",
    "ceremonyStyle": "outdoor-ceremony-indoor-reception",
    "location": ["winter-park", "orlando"],
    "perks": ["lodging"]
  }
}
```

Response:

```json
{
  "resultMode": "exact-match",
  "topVenue": {},
  "runnersUp": [],
  "tags": ["garden", "historic"],
  "disclaimer": null
}
```

### `POST /api/import-venues`

Purpose:
Import the CSV into normalized Supabase rows.

Behavior:

- Parse CSV
- Normalize fields
- Mark launch eligibility
- Upsert venues by stable slug
- Report warnings for incomplete rows

## Kit Integration Flow

### Step 1: Upsert subscriber

- Use `POST /v4/subscribers`
- Authenticate with `X-Kit-Api-Key`
- Pass `email_address` and optional custom fields

### Step 2: Apply tags

- Resolve or pre-create the needed Kit tags
- Apply each tag with `POST /v4/tags/{tag_id}/subscribers`
- Only run after subscriber upsert succeeds

### Step 3: Optional custom fields

Recommended optional fields:

- `quiz_top_venue`
- `quiz_result_mode`
- `quiz_budget_bucket`
- `quiz_guest_range`

## Frontend Plan

### Screens

1. Intro screen
2. Question flow screen
3. Email gate screen
4. Results screen
5. Closest-match disclaimer state

### Key Components

- progress indicator
- answer chips
- multi-select pills
- email gate card
- primary venue card
- runners-up list
- disclaimer banner

### UX Notes

- Keep each question on its own card for mobile readability.
- Show visual momentum with progress count.
- Use language that feels editorial, not robotic.
- Delay result computation until email submission.

## Supabase Plan

### Purpose In v1

- Store normalized launch-ready venues
- Store quiz submission history
- Support future admin reporting if needed

### Not Needed In v1

- complex row-level security design for multiple users
- realtime subscriptions
- Supabase auth for end users

## Vercel Plan

### Purpose In v1

- Host the frontend app
- Serve backend API routes
- Store env vars for Kit and Supabase credentials
- Provide preview deployments for design review

## Squarespace Embed Plan (Confirmed For authormadephoto.com)

### Confirmed Setup Facts

- Site plan: Squarespace Business (supports page-specific Code Blocks and site-wide Code Injection).
- Embed method: a new dedicated page (e.g. `/venue-quiz`) that keeps the normal site header, footer, and nav. The quiz itself lives inside a single contained element on that page, not a full-bleed template override.
- No DNS changes. The Vercel app is referenced by its `*.vercel.app` URL (or a Vercel-issued alias), not a custom subdomain.
- Vercel and Supabase accounts already exist and will be reused.
- Email/CRM: Kit (ConvertKit), per the existing plan.
- Venue data will be maintained by a non-technical owner (you or your wife), so the update path must not require touching code.

### Embed Mechanics

1. Create a new blank Squarespace page: **Venue Quiz** (or similar), URL slug `/venue-quiz`.
2. In the page content area, add a **Code Block** (not a full-page code injection). This keeps the Squarespace header, footer, and nav visible and avoids needing "Advanced/Developer" page settings.
3. Inside the Code Block, embed:
   ```html
   <iframe
     id="venue-quiz-frame"
     src="https://<your-vercel-app>.vercel.app/"
     style="width:100%; border:0; min-height:900px;"
     loading="lazy"
     title="Which Orlando Wedding Venue Fits You?"
   ></iframe>
   <script>
     window.addEventListener("message", (event) => {
       if (event.origin !== "https://<your-vercel-app>.vercel.app") return;
       if (event.data && event.data.type === "quiz-resize") {
         document.getElementById("venue-quiz-frame").style.height = event.data.height + "px";
       }
     });
   </script>
   ```
4. The Vercel app posts its content height to the parent window on load and on every view change (intro → quiz → email → results), so the iframe never scrolls internally or shows dead space:
   ```js
   function reportHeight() {
     window.parent.postMessage({ type: "quiz-resize", height: document.body.scrollHeight }, "*");
   }
   ```
   Call `reportHeight()` after every `showView()` call and on window resize.
5. Add `X-Frame-Options`/`Content-Security-Policy: frame-ancestors https://www.authormadephoto.com` on the Vercel app (not "deny") so it is explicitly embeddable only by your Squarespace domain.

### Why This Approach

- A Code Block on a normal page (vs. per-page Code Injection with "no header/footer") means visitors keep site navigation and your existing footer/legal links — matches your requirement that the quiz be "contained within a specific element," not a takeover page.
- Business-tier Code Blocks support raw HTML/JS/CSS without needing Developer Mode.
- The postMessage resize handshake avoids the classic "iframe with a scrollbar inside a scrollbar" problem on mobile Squarespace pages.
- No DNS work is required, so nothing about your existing email, MX records, or Squarespace domain settings is touched.

### Non-Technical Venue Data Updates

Since venue data will be maintained by a non-technical owner:

- Keep the canonical venue list in a **Google Sheet** (mirrors the current CSV columns), not directly in Supabase or code.
- Publish the sheet as CSV (File → Share → Publish to web → CSV) or connect it read-only via the Google Sheets API.
- Build one small internal admin action (a Vercel API route + a simple password-gated button, not exposed publicly) that re-imports the sheet into Supabase and re-runs the launch-eligibility validation.
- The importer must print a plain-English warning list (e.g. "Missing budget for venue X — excluded from matching") so mistakes are obvious without reading logs.
- This means adding or editing a venue is: edit a row in the Google Sheet → click "Re-import" → done. No code or Supabase console access needed.

### Rollout Steps

1. Deploy the current static prototype's logic as the Vercel app (Phase 1, already mostly done via `localhost-prototype.html`).
2. Add the `postMessage` resize handshake and `frame-ancestors` CSP to the Vercel app.
3. Create the Squarespace `/venue-quiz` page and Code Block per the embed mechanics above.
4. Test on desktop and mobile Squarespace preview, confirming no double-scrollbars and that the iframe height tracks each quiz step.
5. Wire up Kit subscriber upsert + tagging from the Vercel API route.
6. Set up the Google Sheet + re-import admin action for venue data.
7. Soft-launch the page unlinked, QA the full flow end-to-end, then add a nav link / CTA button pointing to `/venue-quiz`.

## Build Phases

### Phase 1: Design and static prototype

- Build the static quiz UI
- Review copy, spacing, and overall feel
- Confirm question flow and content

### Phase 2: Data pipeline

- Create Supabase schema
- Write CSV importer
- Mark launch-ineligible venues automatically
- Validate the normalized output

### Phase 3: Matching engine

- Implement hard-filter logic
- Implement weighted scoring
- Add exact, narrow, and closest result modes
- Test ranking against sample answer sets

### Phase 4: Kit integration

- Add subscriber upsert
- Add tag assignment
- Add failure handling and retries where appropriate

### Phase 5: Squarespace integration

- Deploy to Vercel
- Embed in Squarespace
- Test mobile layout and conversion flow

## Acceptance Checklist

- A visitor can complete the quiz in under 3 minutes.
- Results are blocked until email and consent are submitted.
- Budget and guest count exclude impossible venues.
- Incomplete venue rows do not appear in launch matching.
- The app returns a top venue and up to three runners-up.
- Zero-match cases show closest matches with disclaimer.
- Kit subscriber upsert succeeds with live credentials.
- Kit tags are applied consistently.
- The experience loads inside Squarespace without layout breakage.

## Account Setup Checklist

The code scaffold (package.json, /api serverless functions, supabase/schema.sql) is already in this
repo. These are the account/dashboard steps only you can do, in order:

### 1. Supabase project

1. Create a new project at supabase.com (or reuse an existing empty one).
2. Open the SQL Editor and run the contents of `supabase/schema.sql` once.
3. Go to Project Settings -> API and copy the **Project URL** and the **service_role key**.
4. In your local `.env` (copied from `.env.example`), set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Kit (ConvertKit) API key

1. In Kit, go to Account Settings -> Developer -> API and click "Add a new key".
2. Copy the key immediately (Kit will not show it again) and set `KIT_API_KEY` in `.env`.
3. Check your existing Kit tags against `api/lib/tags.ts`'s `KIT_TAG_NAMES` map. The integration
   creates-or-reuses tags by exact name (case-insensitive), so edit the right-hand values in that
   file if your existing tags use different names (e.g. `"Garden Wedding"` instead of `"garden"`).

### 3. Publish the venue Google Sheet

1. Create a Google Sheet and import `Author_Made_Venue_Quiz_Database_V2.xlsx - Venue Database.csv`
   (File -> Import -> Upload) so the column headers match exactly.
2. File -> Share -> Publish to web -> select the venue tab -> format **CSV** -> Publish.
3. Set `VENUE_SHEET_CSV_URL` in `.env` to the published link.
4. Pick a random shared secret string and set it as `IMPORT_ADMIN_SECRET` in `.env` (also add the
   same value in Vercel's env vars once deployed - this gates `POST /api/import-venues`).

### 4. Vercel project

1. In the Vercel dashboard, "Add New... -> Project" and import `michaeltkuo/wedding-venue-quiz` from GitHub.
2. Framework preset: "Other" (no build command needed - static files + `/api` functions are zero-config).
3. Add all five `.env` variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIT_API_KEY`,
   `VENUE_SHEET_CSV_URL`, `IMPORT_ADMIN_SECRET`) under Project Settings -> Environment Variables.
4. Deploy. Note the resulting `*.vercel.app` URL for the Squarespace embed mechanics above.

### 5. First data import

Once deployed (or running `npm run dev` locally with Vercel CLI), trigger the importer once:

```bash
curl -X POST https://<your-vercel-app>.vercel.app/api/import-venues \
  -H "x-import-secret: <the IMPORT_ADMIN_SECRET value>"
```

This should report `imported` and `launchEligible` counts, plus a `warnings` list naming any venue
still missing budget or capacity data. Re-run this any time the Google Sheet changes.

### 6. Verify end to end

Load the deployed URL directly, complete the quiz, and submit an email. Confirm a row appears in
Supabase's `quiz_submissions` table and the subscriber/tags appear in Kit.

## Immediate Next Steps

1. Complete the Account Setup Checklist above (Supabase, Kit, Google Sheet, Vercel).
2. Run the first venue import and spot-check `launch_eligible` results.
3. Deploy and smoke-test the full quiz -> email -> results flow against real data.
4. Update the iframe `src` in the Squarespace Code Block with the real `*.vercel.app` URL.
5. Soft-launch the Squarespace `/venue-quiz` page unlinked, QA, then link it from the site nav/CTA.