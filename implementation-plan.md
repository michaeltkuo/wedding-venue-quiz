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

## Squarespace Embed Plan

### v1 Recommendation

Use an iframe embed first.

Benefits:

- avoids CSS collisions with Squarespace
- keeps deployment independent
- makes debugging easier
- lets the quiz evolve without touching core site templates

### v2 Option

If the iframe feels too separate, explore script-based embedding after the prototype is validated.

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

## Immediate Next Steps

1. Scaffold the Vercel app.
2. Create the Supabase schema.
3. Write the CSV importer.
4. Implement the ranking engine.
5. Build the frontend screens.
6. Add Kit API integration.
7. Embed the deployed app in Squarespace.