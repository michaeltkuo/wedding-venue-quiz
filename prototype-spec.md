# Wedding Venue Quiz Rapid Prototype Spec

## Objective

Build a rapid prototype for an interactive lead-magnet quiz titled "Which Orlando wedding venue is the best fit for you?" The prototype should collect structured answers, rank venues from a maintained venue dataset, capture the user's email before revealing results, and send segmentation data into ConvertKit.

## Product Goal

Create a quiz that feels more personalized than a traditional 4-6 outcome personality quiz, while staying operationally simple enough to launch quickly and update as new venues are added.

## Primary User Value

- Help engaged couples narrow a large list of Orlando wedding venues into one primary recommendation plus three runners-up.
- Make the quiz feel useful as a planning tool, not just a lead magnet.
- Capture email subscribers and route them into broad nurture segments.

## Business Goal

- Increase email signups from site visitors.
- Segment leads into broad venue-interest buckets for automated follow-up.
- Avoid manually building and maintaining 41+ static outcome pages or 41+ distinct email automations.

## Prototype Success Criteria

- A user can complete the quiz in under 3 minutes.
- The system returns 1 top venue and 3 runners-up from the venue catalog.
- The user must submit an email address before seeing results.
- The submission creates or updates a ConvertKit subscriber.
- The submission applies one or more broad interest tags in ConvertKit.
- Adding a new venue should require updating data, not code.

## Confirmed Decisions

- Results will appear on the website immediately after email capture.
- The prototype should include a real ConvertKit integration in v1.
- The initial venue data source is `Author_Made_Venue_Quiz_Database_V2.xlsx - Venue Database.csv`.
- ConvertKit nurture tags should be derived from the venue taxonomy already present in the source sheet, starting with `Primary Style / Vibe`, `Garden / Botanical`, `Historic`, `European / Old-World`, `Micro-Wedding Fit`, and `Appears In / Source Type`.
- Guest count is a hard filter.
- Budget is a hard filter.
- Any venue row with `TBD`, `Not established`, or missing hard-filter data should be excluded from launch matching.
- If no venues pass hard filters, the prototype should show closest matches with a disclaimer.
- Top-result explanation copy should be generated from the user's response data plus structured venue data.
- The prototype should use Kit tags only in v1 and does not need to add subscribers to a specific Kit form.
- Analytics should be skipped for the prototype.
- The preferred build style is a small embedded web app surfaced via Squarespace code injection, backed by a lightweight external backend.
- The preferred deployment stack is Squarespace for presentation, Vercel for frontend hosting and server endpoints, and Supabase for persistent data.

## Prototype Recommendation

For the rapid prototype, use rules-based ranking rather than an LLM in the critical scoring path.

Reasoning:

- The transcript's main need is personalized matching, not open-ended conversation.
- The input is structured and closed-choice.
- Deterministic ranking is cheaper, faster, easier to debug, and easier to tune.
- The venue catalog is small enough to score directly.
- A lightweight LLM layer can still be used later for optional personalized explanation copy.

## In Scope For Prototype

- One standalone quiz experience that can be embedded in a Squarespace page via code injection.
- 10-12 closed-answer questions.
- Venue ranking against a structured venue dataset.
- Results payload containing:
  - top venue
  - three runners-up
  - confidence or score breakdown for internal debugging
- Email gate before results are shown.
- ConvertKit subscriber creation or update.
- ConvertKit tag assignment based on broad category buckets.
- Admin-editable source data for venues.

## Out Of Scope For Prototype

- True chatbot conversation.
- LLM-only ranking with no deterministic fallback.
- Fully personalized HTML email blocks generated per user.
- Multi-step nurture sequence generation.
- CMS authoring tools for non-technical editing inside Squarespace.
- A polished analytics dashboard.

## Core User Flow

1. User sees a CTA on a blog page, home page, or popup.
2. User lands on the quiz page.
3. User answers 10-12 structured questions.
4. User reaches the email gate.
5. User submits email and consent.
6. System stores answers and computes rankings.
7. User sees results immediately on the page.
8. System sends subscriber data and tags to ConvertKit.
9. Optional confirmation email is sent from ConvertKit.

## Why Show Results On Page In v1

This is the recommended prototype path.

- It removes the hardest unknown in the transcript: injecting fully custom result markup into ConvertKit.
- It still preserves the lead-magnet exchange because the email gate happens before results.
- It reduces launch risk and integration complexity.
- ConvertKit can still be used for tagging and follow-up.

## Functional Requirements

### Quiz Experience

- The quiz title should be "Which Orlando wedding venue is the best fit for you?"
- The quiz should feel editorial and polished, not chatbot-like.
- The quiz should use mostly multiple-choice inputs.
- One or two questions may allow multi-select if needed for "extra perks" or special requirements.
- Questions should be concise and easy to answer on mobile.
- Progress should be visible.

### Data Inputs

Each venue row should support structured attributes such as:

- venue name
- hero image URL
- venue page URL
- vibe or style tags
- location area
- guest count range
- budget range
- indoor or outdoor support
- ceremony support
- reception support
- micro wedding support
- lodging or on-site accommodation
- package style such as all-inclusive
- unique perks
- broad nurture bucket tags
- active or inactive status

### Dataset Readiness Rules

- The current CSV includes both well-researched venues and partially researched venues.
- Some rows contain `TBD`, `Not established`, or missing values for budget, capacity, or logistics.
- For the prototype, only venues with usable values for both budget and guest capacity should be eligible for automatic ranking.
- Incomplete venues should remain in the dataset but be marked as excluded from matching until the missing hard-filter fields are filled.
- The normalization step should emit validation warnings for incomplete rows so the operator can fix data without reading application logs.
- Any row with `TBD`, `Not established`, or blank values in budget or guest capacity should be treated as ineligible for launch.

### Matching Engine

- The system must score every active venue against the user's answers.
- The system must produce a ranked list.
- The system must return exactly 4 unique venues: 1 primary and 3 runners-up.
- The system must apply hard filters for guest count and budget before weighted scoring.
- The system should support weighted preferences for softer traits such as vibe.
- The scoring configuration should be editable without rewriting core app logic.
- The system should exclude venues with unknown values for hard-filtered fields.
- If fewer than 4 venues survive hard filtering, the system must return a graceful fallback result state instead of forcing weak matches.

### Results Screen

- Show the top venue with:
  - name
  - hero image
  - short description
  - button to view the venue page
- Show three runners-up with at minimum:
  - venue name
  - optional thumbnail
  - link to learn more
- Show a brief explanation of why the top match fits.
- Do not imply certainty or exclusivity.

### Email Capture And Consent

- Collect at minimum email address.
- Include marketing consent language.
- Prevent results from showing until submission succeeds or is safely queued.

### ConvertKit Integration

- Create or update subscriber by email.
- Apply broad segment tags such as garden, historic, European-inspired, micro wedding, or all-inclusive.
- Store quiz metadata as custom fields if ConvertKit supports it cleanly.
- Trigger an existing or prototype automation after tagging.

### ConvertKit Integration Design

- Use Kit API V4 for the prototype.
- Use API key authentication for the initial private prototype, since this is a first-party integration for a single Kit account.
- Keep the Kit API key server-side only and send it as the `X-Kit-Api-Key` header.
- Create or upsert the subscriber first through the subscriber endpoint.
- Tag the subscriber only after subscriber creation succeeds.
- If quiz metadata is stored in Kit custom fields, those fields must be created in Kit before the prototype writes to them.
- Do not require adding the subscriber to a specific Kit form in v1.

### Initial Tag Mapping Direction

- Start with broad tags only, not one tag per venue.
- Derive tag candidates from the source sheet columns `Primary Style / Vibe`, `Garden / Botanical`, `Historic`, `European / Old-World`, `Micro-Wedding Fit`, and `Appears In / Source Type`.
- Normalize sheet values into a smaller, stable Kit tag vocabulary for automation.
- Avoid using raw CSV cell text directly as tags without normalization.

### Initial v1 Tag Vocabulary

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

## Non-Functional Requirements

- Mobile-first layout.
- Fast load on Squarespace pages.
- Graceful failure if ConvertKit is temporarily unavailable.
- Basic bot protection on email submission.
- No secrets exposed in client-side code.
- Maintainable without needing 41 manually-authored result pages.

## Proposed Technical Approach

## Frontend

- Single-page embedded quiz app.
- Deploy as static assets plus a lightweight backend endpoint.
- Embed on a Squarespace page via script or iframe.
- Treat Squarespace as the presentation host for the quiz experience, not as the secure execution environment for API secrets.
- Host the frontend application on Vercel and surface it inside Squarespace using an iframe first, with direct code injection as an optional follow-up if the iframe experience is insufficient.

## Backend

- Minimal API service for:
  - receiving quiz answers
  - calculating venue rankings
  - returning results
  - sending subscriber data to ConvertKit
- Store venue data in a simple canonical source such as CSV, JSON, Airtable export, or Google Sheet sync.
- Host the backend outside Squarespace, because the Kit API key and matching logic must not live in client-side code injection.
- Use Vercel server functions for the prototype backend.
- Use Supabase for persistent storage, data normalization targets, and quiz submission history.

### Hosting Recommendation

- The quiz should appear on the Squarespace site through a code injection block, embedded script, or iframe.
- The ranking API and Kit integration should run on a lightweight external backend.
- The frontend should call that backend over HTTPS.
- For the prototype, this means "hosted on Squarespace" from the visitor's perspective, while the secure server logic lives elsewhere.
- The recommended implementation is a Vercel-hosted frontend and API embedded into Squarespace via iframe for v1.
- Supabase should hold normalized venue records and quiz submission records so the app does not depend on parsing the raw CSV on every live request.

### Deployment Architecture

1. Squarespace page contains the quiz shell and embedded app frame.
2. The visitor loads the quiz frontend from Vercel.
3. The frontend requests venue matching from Vercel API routes.
4. Vercel API routes read normalized venue data from Supabase.
5. Vercel API routes write subscriber data to Kit using the private API key.
6. Vercel API routes optionally log quiz submissions and results to Supabase.

### Proposed Backend Request Flow

1. Receive validated quiz answers and email consent.
2. Normalize answers into ranking inputs.
3. Filter out venues that fail budget or guest-count requirements.
4. Rank the remaining venues by weighted preference scoring.
5. Return 1 top result and 3 runners-up, or a no-match fallback.
6. Upsert the subscriber in Kit.
7. Apply derived tags in Kit.
8. Optionally write quiz metadata into pre-defined Kit custom fields.

## Data Source Recommendation

Use the CSV file as the initial source of truth for the prototype, then normalize it into Supabase-backed records for runtime reads.

Recommended prototype flow:

1. Maintain venue data in `Author_Made_Venue_Quiz_Database_V2.xlsx - Venue Database.csv`.
2. Parse and validate the CSV into a normalized internal format.
3. Import the normalized venue data into Supabase.
4. Load the normalized data from Supabase into the ranking engine.

This keeps the first version simple while preserving the transcript requirement that new venues be added through data maintenance rather than code changes.

## Matching Model Recommendation

Use a hybrid deterministic model:

- Hard filters eliminate impossible venues.
- Weighted scoring ranks the remaining venues.
- Optional LLM copy generation explains the winning venue in a short paragraph.

Example scoring dimensions:

- vibe match: high weight
- guest count fit: hard gate
- budget fit: hard gate
- indoor or outdoor fit: medium-high weight
- micro wedding or large wedding support: medium weight
- special perks match: low-medium weight
- geographic preference: medium weight

## No-Match And Low-Match Behavior

- If zero venues pass the hard filters, show a helpful no-match message rather than a fabricated recommendation.
- The no-match state should offer closest matches with a clear disclaimer that they do not fully meet the selected must-haves.
- The no-match state should also suggest broad alternatives such as increasing budget, expanding geography, or changing guest count expectations.
- If 1-3 venues pass the hard filters, return those venues and explain that the shortlist is narrower because of the selected must-haves.

## Result Explanation Strategy

- Generate the top-result explanation from structured user answers plus structured venue facts.
- The explanation should sound tailored, but should not claim facts not present in the dataset.
- The explanation should reference the strongest matching reasons such as vibe, venue type, guest count fit, and notable perks.
- The explanation should avoid overly conversational AI phrasing such as quoting the user's answers back verbatim.

## Prototype Data Contract

### Quiz Submission

```json
{
  "email": "user@example.com",
  "consent": true,
  "answers": {
    "vibe": ["romantic-garden"],
    "guestCount": "75-125",
    "budget": "5000-9000",
    "ceremonyStyle": "outdoor-ceremony-indoor-reception",
    "location": ["orlando-area"],
    "perks": ["lodging", "all-inclusive"]
  }
}
```

### Result Payload

```json
{
  "topVenue": {
    "id": "venue_12",
    "name": "Leu Gardens",
    "imageUrl": "https://...",
    "url": "https://...",
    "summary": "A strong match for couples wanting a romantic garden setting with flexible indoor backup.",
    "score": 91
  },
  "runnersUp": [
    { "id": "venue_5", "name": "Casa Feliz", "url": "https://...", "score": 84 },
    { "id": "venue_8", "name": "The Wellborn", "url": "https://...", "score": 81 },
    { "id": "venue_3", "name": "Venue 3", "url": "https://...", "score": 79 }
  ],
  "tags": ["garden", "historic"]
}
```

## Suggested Prototype Question Set

1. What wedding vibe fits you best?
2. About how many guests are you inviting?
3. What budget range are you targeting for the venue?
4. Which ceremony and reception setup sounds best?
5. Which part of greater Orlando do you prefer?
6. Which type of setting do you want most?
7. How important is indoor backup?
8. Are you planning a micro wedding, standard wedding, or large celebration?
9. Which special perks matter most?
10. How much planning support do you want from the venue?
11. How formal or relaxed should the space feel?
12. Which statement sounds most like your priority?

## Remaining Open Decisions

These still need confirmation before implementation starts.

1. Which exact Kit tags already exist in the account versus need to be created?
2. Whether the quiz should be embedded via iframe only in v1, or whether a direct JavaScript embed should also be attempted.

## Blocking Inputs For Build Kickoff

- The Kit API credentials are not yet defined here.
- The final Kit tag setup in the account is not yet defined here.

## Acceptance Criteria For v1 Prototype

- The app can be opened on desktop and mobile.
- A user can complete the quiz and submit an email.
- The system ranks venues from a source dataset with at least 41 rows.
- The app shows 1 top match and 3 runners-up.
- The app sends at least one broad tag to ConvertKit or to a mock endpoint for demo purposes.
- A new venue can be added through the dataset and appear in future results without changing frontend code.

## Recommended Build Sequence

1. Finalize question set and answer taxonomy.
2. Define the venue data schema.
3. Build deterministic ranking logic against mock venue data.
4. Build quiz UI and results page.
5. Add email gate and submission flow.
6. Integrate ConvertKit tagging.
7. Add optional LLM-generated explanation copy.
8. Embed into Squarespace for testing.

## Risks

- ConvertKit may not support the exact dynamic email rendering imagined in the transcript without custom engineering.
- Poorly normalized venue data will produce weak recommendations regardless of UI quality.
- Overusing LLMs too early may make ranking less predictable and harder to trust.
- If too many questions are required for accuracy, completion rate may fall.

## Recommendation Summary

The fastest credible prototype is:

- embedded quiz on Squarespace
- structured data source for venues
- deterministic ranking engine
- email gate before reveal
- on-page results
- ConvertKit tagging for follow-up

This validates the core product idea without taking on the hardest unknowns in the first build.