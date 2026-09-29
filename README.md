# Author Made Venue Quiz

An embeddable Orlando wedding venue matching quiz for [Author Made Photo + Video](https://www.authormadephoto.com).

The approved quiz experience runs as a static HTML frontend inside a Squarespace Code Block iframe. Matching, email capture, and Kit tagging run through Vercel serverless functions. There is no database - venue data is fetched and ranked directly from a published Google Sheet CSV on each request.

## Architecture

```text
Squarespace /venue-quiz page
  -> Code Block
    -> iframe: Vercel deployment /embed-app.html
      -> POST /api/match
        -> published Google Sheet CSV (fetched + cached in memory, ~5 min TTL)
        -> deterministic ranking engine
        -> Kit subscriber + tag sync
```

### Key files

- `embed-app.html` — deployable quiz frontend. It contains the approved visual design and question flow, but no private credentials or venue-ranking logic.
- `squarespace-embed-preview.html` — local design-review harness that simulates the Squarespace page, host header/footer, iframe, responsive mobile frame, and embed inspector. Do not use this as the production embed.
- `localhost-prototype.html` — original standalone prototype kept as a visual/reference comparison.
- `api/match.ts` — Vercel endpoint for validation, ranking, and Kit sync.
- `api/lib/venueSource.ts` — fetches and caches the published Google Sheet CSV in memory.
- `api/lib/normalize.ts` — converts messy spreadsheet values into controlled fields.
- `api/lib/importVenues.ts` — parses the CSV into normalized venue records.
- `api/lib/ranking.ts` — hard filters, weighted scoring, result explanations, and Kit tag derivation.
- `api/lib/kit.ts` — Kit API v4 client.
- `api/lib/tags.ts` — internal tag keys and Kit tag names.
- `implementation-plan.md` — detailed product, deployment, and rollout plan.
- `question-to-field-mapping.md` — mapping between quiz questions and source-sheet columns.

## Prerequisites

- Node.js 20 or newer recommended
- npm
- GitHub repository access
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
| `KIT_API_KEY` | Kit API v4 key; server-only |
| `VENUE_SHEET_CSV_URL` | Published CSV URL for the Google Sheet venue tab |
| `VERCEL_APP_PASSWORD` | Optional Vercel deployment protection password |

`.env` is ignored by Git. Never paste secret values into source files, Squarespace Code Blocks, browser JavaScript, or chat.

## Venue data workflow

The Google Sheet is the operator-facing source of truth. Its header row should match the existing CSV:

`Author_Made_Venue_Quiz_Database_V2.xlsx - Venue Database.csv`

To publish it:

1. Import the CSV into Google Sheets.
2. Keep the existing column headers unchanged.
3. Use **File -> Share -> Publish to web**.
4. Select the venue tab and CSV format.
5. Put the published URL in `VENUE_SHEET_CSV_URL`.

Edits to the sheet go live automatically - `api/lib/venueSource.ts` fetches the CSV fresh and caches
it in memory for about 5 minutes per warm serverless instance. There is no manual import step or
admin endpoint to trigger; just edit the sheet and wait a few minutes.

A venue is excluded from matching when budget or capacity is blank, `TBD`, `Not established`, or otherwise lacks a usable value. Excluded rows stay in the sheet (and are still visible in `warnings` if you inspect a raw fetch) so they can be corrected later.

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

A temporary Kit outage does not prevent the visitor from seeing a valid venue result; the API logs the failure server-side and still returns the match. There is no separate submission log - Kit is the only place subscriber/tag data lives.

## Vercel deployment

1. Push the repository to GitHub after reviewing the local commit.
2. In Vercel, choose **Add New -> Project**.
3. Import `michaeltkuo/wedding-venue-quiz`.
4. Use the **Other** framework preset.
5. Add both environment variables from `.env.example` (`KIT_API_KEY`, `VENUE_SHEET_CSV_URL`).
6. Deploy and copy the resulting `*.vercel.app` URL.

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
- Opening the published Google Sheet CSV URL directly in a browser returns raw CSV text.
- `/api/match` rejects invalid email and missing consent.
- Budget and guest capacity behave as hard filters.
- The closest-match state appears when no eligible venues pass both filters.

### After deployment

- Open the Vercel URL directly and complete the quiz.
- Submit a test email and confirm the result appears.
- Confirm the subscriber and tags appear in Kit.
- Embed the Vercel URL in a Squarespace preview page.
- Check desktop and mobile layouts.
- Confirm there is no internal iframe scrollbar or large dead space.
- Confirm the Squarespace page retains its normal header, footer, and navigation.

## Troubleshooting

### `Could not load venue data`

Check that `VENUE_SHEET_CSV_URL` is set in the current environment and that the URL returns raw CSV
when opened directly (not an HTML login/permissions page). Google Sheets "Publish to web" links can
stop working if the sheet's sharing settings change.

### The sheet fetch returns zero rows

Confirm the Google Sheet is published as CSV, the published URL points to the correct tab, and the first row contains the expected source column headers.

### Kit sync fails

Confirm `KIT_API_KEY` is a Kit v4 key, not a legacy key. Check the Vercel function logs and verify the API key has access to the account. Results are intentionally still returned when Kit is unavailable.

### The iframe is blank

Check the deployed URL directly first. Then inspect the browser console for a `frame-ancestors` or `X-Frame-Options` conflict. The deployed app must permit `https://www.authormadephoto.com` to frame it.

### Nested scrolling appears in Squarespace

Confirm the Code Block's `message` listener uses the same `quiz-resize` event type and that the iframe height is updated from the event payload. Do not set a small fixed height in production.

## Security notes

- Keep the Kit API key server-side.
- Keep `.env` ignored and never commit it.
- Restrict `frame-ancestors` to the production Squarespace domain.
- Validate email and consent in the serverless endpoint even though the browser also validates them.
- The published Google Sheet CSV is world-readable by link design (Google's "Publish to web" has no
  access control) - don't put anything sensitive in it beyond venue marketing details.
