# Author Made Venue Quiz

An embeddable Orlando wedding venue matching quiz for [Author Made Photo + Video](https://www.authormadephoto.com).

The approved quiz experience runs as a static HTML frontend inside a Squarespace Code Block iframe. Secure matching, venue storage, email capture, and Kit tagging run through Vercel serverless functions and Supabase.

## Architecture

```text
Squarespace /venue-quiz page
  -> Code Block
    -> iframe: Vercel deployment /embed-app.html
      -> POST /api/match
        -> Supabase venues table
        -> deterministic ranking engine
        -> Kit subscriber + tag sync
        -> Supabase quiz_submissions table
```

### Key files

- `embed-app.html` — deployable quiz frontend. It contains the approved visual design and question flow, but no private credentials or venue-ranking logic.
- `squarespace-embed-preview.html` — local design-review harness that simulates the Squarespace page, host header/footer, iframe, responsive mobile frame, and embed inspector. Do not use this as the production embed.
- `localhost-prototype.html` — original standalone prototype kept as a visual/reference comparison.
- `api/match.ts` — Vercel endpoint for validation, ranking, Kit sync, and submission logging.
- `api/import-venues.ts` — protected Vercel endpoint for importing the published Google Sheet CSV.
- `api/lib/normalize.ts` — converts messy spreadsheet values into controlled fields.
- `api/lib/ranking.ts` — hard filters, weighted scoring, result explanations, and Kit tag derivation.
- `api/lib/kit.ts` — Kit API v4 client.
- `api/lib/tags.ts` — internal tag keys and Kit tag names.
- `supabase/schema.sql` — database schema to run in Supabase SQL Editor.
- `implementation-plan.md` — detailed product, deployment, and rollout plan.
- `question-to-field-mapping.md` — mapping between quiz questions and source-sheet columns.

## Prerequisites

- Node.js 20 or newer recommended
- npm
- GitHub repository access
- Supabase account
- Kit account with API access enabled
- Vercel account
- Squarespace Business plan or higher for the Code Block embed

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` with the values described below.

4. Run the typecheck:

   ```bash
   npm run typecheck
   ```

5. Run the Vercel development server:

   ```bash
   npm run dev
   ```

   The Vercel CLI will print the local URL. The root route rewrites to `embed-app.html` through `vercel.json`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key; never expose it to the browser |
| `KIT_API_KEY` | Kit API v4 key; server-only |
| `VENUE_SHEET_CSV_URL` | Published CSV URL for the Google Sheet venue tab |
| `IMPORT_ADMIN_SECRET` | Secret required by the venue import endpoint |
| `VERCEL_APP_PASSWORD` | Optional Vercel deployment protection password |

`.env` is ignored by Git. Never paste secret values into source files, Squarespace Code Blocks, browser JavaScript, or chat.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run the complete contents of `supabase/schema.sql`.
4. Open **Project Settings -> API**.
5. Copy the project URL and service-role key into local `.env` and Vercel environment variables.

The service-role key is used only by the serverless functions. The browser never connects directly to Supabase.

### Tables

- `venues` — normalized venue records and launch eligibility.
- `quiz_submissions` — consented quiz submissions and matched venue IDs.
- `tag_mappings` — optional future data-driven mapping from source-sheet values to Kit tags.

## Venue data workflow

The Google Sheet is the operator-facing source of truth. Its header row should match the existing CSV:

`Author_Made_Venue_Quiz_Database_V2.xlsx - Venue Database.csv`

To publish it:

1. Import the CSV into Google Sheets.
2. Keep the existing column headers unchanged.
3. Use **File -> Share -> Publish to web**.
4. Select the venue tab and CSV format.
5. Put the published URL in `VENUE_SHEET_CSV_URL`.

To import or refresh venue data after editing the sheet:

```bash
curl -X POST https://YOUR-VERCEL-APP.vercel.app/api/import-venues \
  -H "x-import-secret: YOUR-IMPORT-ADMIN-SECRET"
```

The response includes:

- number of rows imported
- number of launch-eligible venues
- plain-English warnings for venues excluded from matching

A venue is excluded from matching when budget or capacity is blank, `TBD`, `Not established`, or otherwise lacks a usable value. Excluded rows remain in Supabase so they can be corrected later.

## Matching behavior

### Hard filters

The ranking engine first applies:

- budget selection
- minimum guest capacity

Only rows with `launch_eligible = true` participate.

### Weighted preferences

Remaining venues are scored using:

- style/vibe fit
- ceremony/reception format
- indoor/outdoor preference
- location preference
- micro-wedding fit
- selected perks
- planning style
- final priority

The scoring is deterministic. Adding or editing venue data does not require editing frontend code.

### Result modes

- `exact` — four or more venues pass the hard filters.
- `narrow` — one to three venues pass the hard filters.
- `closest` — no venue passes both hard filters; the closest eligible venues are returned with a disclaimer.

## Kit setup

1. In Kit, open **Account Settings -> Developer -> API**.
2. Create a Kit API v4 key.
3. Store it as `KIT_API_KEY` in local `.env` and in Vercel environment variables.
4. Compare your account's tag names with `api/lib/tags.ts`.
5. Update only the right-hand values in `KIT_TAG_NAMES` if your existing tags use different names.

The integration:

1. Upserts the subscriber by email address.
2. Creates or reuses each tag by name.
3. Tags the subscriber by email address.
4. Logs the submission and result in Supabase.

A temporary Kit outage does not prevent the visitor from seeing a valid venue result; the API logs the failure server-side and still returns the match.

## Vercel deployment

1. Push the repository to GitHub after reviewing the local commit.
2. In Vercel, choose **Add New -> Project**.
3. Import `michaeltkuo/wedding-venue-quiz`.
4. Use the **Other** framework preset.
5. Add all environment variables from `.env.example`.
6. Deploy and copy the resulting `*.vercel.app` URL.
7. Run the first venue import against the deployed URL.

No build command is required. Vercel serves the static frontend and detects the TypeScript files in `api/` as serverless functions.

## Squarespace embed

Create a dedicated Squarespace page such as `/venue-quiz`, then add a Code Block containing:

```html
<iframe
  id="venue-quiz-frame"
  src="https://YOUR-VERCEL-APP.vercel.app/"
  style="width:100%; border:0; min-height:900px;"
  loading="lazy"
  title="Which Orlando Wedding Venue Fits You?"
></iframe>
<script>
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://YOUR-VERCEL-APP.vercel.app") return;
    if (event.data && event.data.type === "quiz-resize") {
      document.getElementById("venue-quiz-frame").style.height = event.data.height + "px";
    }
  });
</script>
```

Replace `YOUR-VERCEL-APP` in both places. The deployed app should also use a `Content-Security-Policy` `frame-ancestors` rule allowing only `https://www.authormadephoto.com`.

The iframe frontend posts its document height whenever the quiz view changes or content resizes. This prevents nested scrollbars on Squarespace, especially on mobile.

### Popup-to-quiz entry flow

If a scroll-triggered Squarespace popup links to `/venue-quiz`, the visitor normally lands on the
intro screen and must click "Find My Venue Match" a second time. To skip that extra click, point
the popup's button at `/venue-quiz?start=1` instead of the bare page URL - `embed-app.html` reads
that query param and jumps straight to question 1. Leave the query param off for any direct nav
link (e.g. the site header), so those visitors still see the intro/context screen first.

## Testing checklist

### Before deployment

- `npm run typecheck` passes.
- `.env` is not tracked by Git.
- `supabase/schema.sql` has been run successfully.
- The Google Sheet import reports the expected eligible-venue count.
- Incomplete rows appear in the import warnings.
- `/api/match` rejects invalid email and missing consent.
- Budget and guest capacity behave as hard filters.
- The closest-match state appears when no eligible venues pass both filters.

### After deployment

- Open the Vercel URL directly and complete the quiz.
- Submit a test email and confirm the result appears.
- Confirm the subscriber and tags appear in Kit.
- Confirm the submission row appears in Supabase.
- Embed the Vercel URL in a Squarespace preview page.
- Check desktop and mobile layouts.
- Confirm there is no internal iframe scrollbar or large dead space.
- Confirm the Squarespace page retains its normal header, footer, and navigation.

## Troubleshooting

### `Could not load venue data`

Check that the Supabase schema has been run, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in the current environment, and the `venues` table contains imported rows.

### Import returns `401`

The `x-import-secret` header must exactly match `IMPORT_ADMIN_SECRET` in the deployed Vercel environment.

### Import returns zero rows

Confirm the Google Sheet is published as CSV, the published URL points to the correct tab, and the first row contains the expected source column headers.

### Kit sync fails

Confirm `KIT_API_KEY` is a Kit v4 key, not a legacy key. Check the Vercel function logs and verify the API key has access to the account. Results are intentionally still returned when Kit is unavailable.

### The iframe is blank

Check the deployed URL directly first. Then inspect the browser console for a `frame-ancestors` or `X-Frame-Options` conflict. The deployed app must permit `https://www.authormadephoto.com` to frame it.

### Nested scrolling appears in Squarespace

Confirm the Code Block's `message` listener uses the same `quiz-resize` event type and that the iframe height is updated from the event payload. Do not set a small fixed height in production.

## Security notes

- Keep Supabase service-role and Kit API keys server-side.
- Keep `.env` ignored and never commit it.
- Restrict `frame-ancestors` to the production Squarespace domain.
- Validate email and consent in the serverless endpoint even though the browser also validates them.
- Keep the import endpoint protected by `IMPORT_ADMIN_SECRET`.
- Do not expose Supabase service-role credentials in a Google Sheet, Squarespace Code Block, or frontend source.
