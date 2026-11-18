# Author Made Venue Quiz

An embeddable Orlando wedding venue matching quiz for [Author Made Photo + Video](https://www.authormadephoto.com).

The approved quiz experience runs as a static HTML frontend inside a Squarespace Code Block iframe. Matching, email capture, and Kit tagging run through Vercel serverless functions. There is no database - venue data is parsed and ranked directly from a CSV on each request.

> **Current phase: no external dependencies.** Venue data is read from the committed `data/venues.csv`, and the Kit sync is off unless `KIT_API_KEY` is set. The project deploys and runs the full quiz with an empty environment. See `implementation-plan.md` for how and when each is switched on.

## Architecture

```text
Squarespace /venue-quiz page
  -> Code Block
    -> iframe: Vercel deployment /embed-app.html
      -> POST /api/match
        -> data/venues.csv (default), or published Google Sheet CSV when
           VENUE_SHEET_CSV_URL is set (fetched + cached in memory, ~5 min TTL)
        -> deterministic ranking engine
        -> Kit subscriber + tag sync (only when KIT_API_KEY is set)
```

### Key files

- `embed-app.html` — deployable quiz frontend. It contains the approved visual design and question flow, but no private credentials or venue-ranking logic.
- `squarespace-embed-preview.html` — local design-review harness that simulates the Squarespace page, host header/footer, iframe, responsive mobile frame, and embed inspector. Do not use this as the production embed.
- `localhost-prototype.html` — original standalone prototype kept as a visual/reference comparison.
- `data/venues.csv` — committed venue dataset; the default data source.
- `api/match.ts` — Vercel endpoint for validation, ranking, and the optional Kit sync.
- `api/lib/venueSource.ts` — reads `data/venues.csv`, or fetches and caches the published Google Sheet CSV when `VENUE_SHEET_CSV_URL` is set.
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

All three are optional right now. With none of them set, the quiz runs on `data/venues.csv` and skips the Kit sync.

| Variable | Purpose | Unset behavior |
| --- | --- | --- |
| `KIT_API_KEY` | Kit API v4 key; server-only | Kit sync is skipped; the response reports `kitSync: "skipped"` |
| `VENUE_SHEET_CSV_URL` | Published CSV URL for the Google Sheet venue tab | Venue data is read from `data/venues.csv` |
| `VERCEL_APP_PASSWORD` | Optional Vercel deployment protection password | No deployment protection |

`.env` is ignored by Git. Never paste secret values into source files, Squarespace Code Blocks, browser JavaScript, or chat.

## Venue data workflow

### Now: committed CSV

`data/venues.csv` is the data source. To change venue data, edit that file, commit, and redeploy. Its
header row is authoritative for the parser in `api/lib/importVenues.ts`.

### Later: published Google Sheet

The Google Sheet becomes the operator-facing source of truth. Its header row must match
`data/venues.csv`. To publish it:

1. Import the CSV into Google Sheets.
2. Keep the existing column headers unchanged.
3. Use **File -> Share -> Publish to web**.
4. Select the venue tab and CSV format.
5. Put the published URL in `VENUE_SHEET_CSV_URL`.

Once `VENUE_SHEET_CSV_URL` is set, edits to the sheet go live automatically - `api/lib/venueSource.ts`
fetches the CSV fresh and caches it in memory for about 5 minutes per warm serverless instance. There
is no manual import step or admin endpoint to trigger; just edit the sheet and wait a few minutes.

### Exclusions

A venue is excluded from matching when capacity has no usable upper bound, or when both budget flags
(`Under $2k?`, `Under $5k?`) are blank or hedged. Hedged values such as `Unclear; likely yes` or
`Yes (ceremony only)` are treated as unknown rather than as a `Yes`, so they never place a venue in a
budget bucket it may not actually fit. Excluded rows stay in the data (and are visible in `warnings`
if you inspect a raw fetch) so they can be corrected later. 39 of the current 41 rows are eligible.

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

### Result ranking and modes

Every result shows one top match plus three runners-up. Style/vibe (Q1) ranks above everything else:
a venue in the chosen style that misses a requirement beats a venue in another style that meets them
all. Within each style group, venues meeting every requirement come first, then venues that fit the
guest count, then the smallest misses, then the weighted score.

- `exact` — all four shown venues meet the budget, guest-count, setting and dealbreaker requirements.
- `narrow` — the top match meets them all, but at least one runner-up does not.
- `closest` — even the top match misses at least one requirement.

The top match always shows a fixed "closest fits" note. The runners-up show a "narrowed down our list"
note only in `narrow` and `closest` mode.

## Kit setup (deferred)

The Kit sync is currently off. `api/match.ts` only calls Kit when `KIT_API_KEY` is set; otherwise it
logs that the sync was skipped and still returns the venue result. Note that while Kit is off the
submitted email is used for nothing and is not stored anywhere, so use test addresses and do not send
real traffic to the deploy until Kit is connected.

To turn it on:

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
5. Set no environment variables. Turn on **Deployment Protection** while the quiz is still being validated.
6. Deploy and copy the resulting `*.vercel.app` URL.

No build command is required. Vercel serves the static frontend and detects the TypeScript files in `api/` as serverless functions. `vercel.json` bundles `data/**` into the function with `functions.includeFiles` so the venue CSV is readable at runtime.

Add `VENUE_SHEET_CSV_URL` and `KIT_API_KEY` later, when moving to live sheet data and Kit.

## Squarespace embed

Create a dedicated Squarespace page such as `/venue-quiz`, then add a Code Block (with **Display Source** turned off) containing:

```html
<iframe
  id="venue-quiz-frame"
  src="https://YOUR-VERCEL-APP.vercel.app/"
  style="display:block; width:100%; height:560px; border:0;"
  title="Which Orlando Wedding Venue Fits You?"
></iframe>
<script>
  (function () {
    var quizOrigin = "https://YOUR-VERCEL-APP.vercel.app";
    var HEADER_OFFSET = 100; // room for a sticky Squarespace header; adjust if the quiz top hides under it
    var frame = document.getElementById("venue-quiz-frame");
    window.addEventListener("message", function (event) {
      if (event.origin !== quizOrigin || !event.data) return;
      if (event.data.type === "quiz-resize") {
        frame.style.height = event.data.height + "px";
      }
      if (event.data.type === "quiz-scroll-top") {
        var top = frame.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.5) {
          window.scrollTo({ top: window.scrollY + top - HEADER_OFFSET, behavior: "smooth" });
        }
      }
    });
  })();
</script>
```

Replace `YOUR-VERCEL-APP` in both places. The deployed app should also use a `Content-Security-Policy` `frame-ancestors` rule allowing only `https://www.authormadephoto.com`.

The quiz is a single card that fills 100% of the iframe's width and lays itself out from that width (container queries), so the Code Block can sit in a full-width section or a narrower column. The iframe frontend posts two messages to the host page:

- `{ type: "quiz-resize", height }` — the card's height, whenever the screen changes or the content resizes. The iframe grows and shrinks to fit, so there is no nested scrollbar. The `560px` in the snippet is only the starting height before the first message arrives.
- `{ type: "quiz-scroll-top" }` — on every screen or question change. The listener scrolls the page so the top of the quiz is in view, but only when the quiz top has scrolled above the viewport or sits below its middle, so it does not jump when the top is already visible.

Notes from testing on the live Squarespace page:

- In Squarespace's Fluid Engine, drag the Code Block as short as it will go on desktop. The block grows past its drawn height when the iframe gets taller, but it never shrinks below the drawn height, so a tall block leaves dead space under the quiz on shorter screens.
- The site's floating "Schedule a Free Consultation" button can overlap the quiz on phones. Check the answer buttons and Next button on a phone before launch.

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
- If `VENUE_SHEET_CSV_URL` is set, opening it directly in a browser returns raw CSV text.
- `/api/match` rejects invalid email and missing consent.
- Budget and guest capacity behave as hard filters.
- The closest-match state appears when no eligible venues pass both filters.

### After deployment

- Open the Vercel URL directly and complete the quiz.
- Submit a test email and confirm the result appears.
- Confirm the response includes `kitSync: "skipped"` while Kit is off.
- Once Kit is enabled, confirm the subscriber and tags appear in Kit.
- Embed the Vercel URL in a Squarespace preview page.
- Check desktop and mobile layouts.
- Confirm there is no internal iframe scrollbar or large dead space.
- Confirm the Squarespace page retains its normal header, footer, and navigation.

## Troubleshooting

### `Could not load venue data`

If `VENUE_SHEET_CSV_URL` is unset, the function could not read `data/venues.csv` from disk. Confirm
the file is committed and that `vercel.json` still has the `functions.includeFiles` entry for `data/**`.

If `VENUE_SHEET_CSV_URL` is set, check that the URL returns raw CSV when opened directly (not an HTML
login/permissions page). Google Sheets "Publish to web" links can stop working if the sheet's sharing
settings change. To rule the sheet out, unset the variable and redeploy to fall back to the committed CSV.

### The sheet fetch returns zero rows

Confirm the Google Sheet is published as CSV, the published URL points to the correct tab, and the first row contains the expected source column headers.

### Kit sync fails

Confirm `KIT_API_KEY` is a Kit v4 key, not a legacy key. Check the Vercel function logs and verify the API key has access to the account. Results are intentionally still returned when Kit is unavailable.

### The iframe is blank

Check the deployed URL directly first. Then inspect the browser console for a `frame-ancestors` or `X-Frame-Options` conflict. The deployed app must permit `https://www.authormadephoto.com` to frame it.

### Nested scrolling appears in Squarespace

Confirm the Code Block matches the snippet in [Squarespace embed](#squarespace-embed): the listener's `quizOrigin` must exactly match the iframe `src` origin (scheme and host, no trailing slash), and it must handle the `quiz-resize` event type by setting the iframe height from the event payload. The iframe's starting `height:560px` is only a fallback until the first message arrives; do not add a `min-height` or `overflow` rule that keeps the iframe from following the quiz. If there is dead space below the quiz on desktop, the Fluid Engine Code Block is drawn taller than the quiz; drag it shorter.

## Security notes

- Keep the Kit API key server-side.
- Keep `.env` ignored and never commit it.
- Restrict `frame-ancestors` to the production Squarespace domain.
- Validate email and consent in the serverless endpoint even though the browser also validates them.
- The published Google Sheet CSV is world-readable by link design (Google's "Publish to web" has no
  access control) - don't put anything sensitive in it beyond venue marketing details.
