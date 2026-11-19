# Author Made Venue Quiz

An embeddable Orlando wedding venue matching quiz for [Author Made Photo + Video](https://www.authormadephoto.com).

The approved quiz experience runs as a static HTML frontend inside a Squarespace Code Block iframe. Matching, email capture, and Kit tagging run through Vercel serverless functions. There is no database - venue data is parsed and ranked directly from a CSV on each request.

## Project status (v1.0)

| Area | Status |
| --- | --- |
| Quiz frontend (`embed-app.html`) | Complete. Optional first name and wedding month on the email screen. |
| Matching and ranking | Complete. Style-first ranking, always one top match plus three runners-up. |
| Venue data | Committed `data/venues.csv`. Published-Google-Sheet mode is built and optional (`VENUE_SHEET_CSV_URL`). |
| Kit integration | Complete. Creates the subscriber, fills four custom fields, and applies the "Quiz taker" and style tags. Runs only when `KIT_API_KEY` is set. |
| Automated tests | 120+ tests; CI enforces 90% coverage on `api/`. |
| CI and releases | GitHub Actions run typecheck and tests on every PR; semantic-release tags versions from commit messages. |

Still manual, outside this repo: building the Kit welcome sequences and automations, verifying the Kit sending domain, and pasting the Squarespace Code Block. The launch checklist lives in the "Email Launch Plan: Quiz to Kit" doc.

The project still deploys and runs the full quiz with an empty environment (no `KIT_API_KEY`, no sheet URL). See `implementation-plan.md` for the original rollout plan.

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
- `api/lib/ranking.ts` — hard filters, weighted scoring, and result explanations.
- `api/lib/kit.ts` — Kit API v4 client and `syncQuizSignup` (subscriber, fields, tags).
- `api/lib/tags.ts` — the five style tag names, the "Quiz taker" tag, Kit custom field keys, and the first-listed-style rule.
- `tests/` — Vitest suite (kept outside `api/` because Vercel treats every file in `api/` as an endpoint).
- `.github/workflows/` — `ci.yml` (typecheck, tests, coverage gate, PR-title check) and `release.yml` (semantic-release).
- `.releaserc.json` — semantic-release configuration.
- `CONTRIBUTING.md` — how to make and ship a change.
- `implementation-plan.md` — detailed product, deployment, and rollout plan.
- `question-to-field-mapping.md` — mapping between quiz questions and source-sheet columns.

## Prerequisites

- Node.js 22 or newer (CI runs Node 22)
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

4. Run the typecheck and the tests:

   ```bash
   npm run ci
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

## Kit setup

The Kit sync only runs when `KIT_API_KEY` is set; otherwise `api/match.ts` logs that the sync was skipped
and still returns the venue result (`kitSync: "skipped"`). While it is off, the submitted email is used for
nothing and is not stored anywhere, so use test addresses until Kit is connected.

Spec: the "Email Launch Plan: Quiz to Kit" doc (Step 3 and the developer brief).

To turn it on:

1. In Kit, open **Account Settings -> Developer -> API** and create a V4 API key.
2. Store it as `KIT_API_KEY` in local `.env` and in Vercel environment variables, then redeploy.
3. In Kit, make sure these exist, spelled exactly:
   - Custom fields: `top_style`, `quiz_results`, `wedding_date`, `signup_source`.
   - Tags: `Garden Romance`, `Old-World Character`, `Modern + Editorial`, `Relaxed + Rustic`, `Classic Elegance`, `Quiz taker`.

What `syncQuizSignup` (`api/lib/kit.ts`) does on each submission with consent:

1. Upserts the subscriber (`POST /v4/subscribers`) with `first_name` (optional box on the email screen) and the custom fields `quiz_results` (simple HTML of the top match and runners-up with links), `wedding_date` (`YYYY-MM`, optional) and `signup_source` (the `?src=` value).
2. Tags **Quiz taker**.
3. Adds the style tag only if the subscriber has none of the five style tags yet, and sets `top_style` at the same time. The style is the first entry in the #1 venue's "Primary Style / Vibe" cell (Leu Gardens -> `Garden Romance`). Retakers keep their first style, so they never start a second welcome sequence.

Tag names and field keys live in `api/lib/tags.ts`. Each Kit call has a 4 second timeout, and a Kit failure never blocks the visitor's result: the error is logged server-side and the response reports `kitSync: "failed"`. There is no separate submission log - Kit is the only place subscriber data lives.

`signup_source`: the quiz runs in an iframe, so a `?src=` on the Squarespace page address is not visible to it. The Code Block below forwards it onto the iframe URL. Link quiz buttons in blog posts like `/venue-quiz?src=villa-festa-review`.

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
    // Forward the page's ?src= (which blog post sent them) to the quiz so Kit's signup_source is filled.
    var src = new URLSearchParams(window.location.search).get("src");
    if (src) {
      var iframeEl = document.getElementById("venue-quiz-frame");
      iframeEl.src = iframeEl.src + (iframeEl.src.indexOf("?") === -1 ? "?" : "&") + "src=" + encodeURIComponent(src);
    }
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

## Automated tests and CI

Run these before opening a PR. Because the only deployed environment is live, the automated suite is the safety net.

```bash
npm test               # run the suite once
npm run test:watch     # re-run on change
npm run test:coverage  # run with coverage; fails below 90% (lines, branches, functions, statements)
npm run ci             # typecheck + coverage run, exactly what GitHub Actions runs
```

What is covered (`tests/`):

- **`normalize`, `importVenues`**: spreadsheet value cleanup and CSV parsing, including old and new column layouts.
- **Data integrity of `data/venues.csv`**: unique slugs, and every launch-eligible venue's first style maps to one of the five Kit style tags. A venue that fails this would silently skip the welcome sequence.
- **`ranking`**: filters, scoring, ordering rules, summaries and display tags.
- **`kit`**: the Kit client against a stubbed `fetch`, including the retake rule (no second style tag) and error handling. Tests never call the real Kit API.
- **`match`**: the `/api/match` handler: validation, input sanitizing, HTML escaping of `quiz_results`, and "a Kit failure never blocks results".
- **`venueSource`**: static file vs. published sheet, caching, fetch errors.

Not covered by the automated suite: `embed-app.html` (the browser UI) and the live Kit/Vercel/Squarespace integration. Use the manual checklist below for those.

### GitHub Actions

- **CI** (`.github/workflows/ci.yml`): on every pull request and push to `main`, runs the typecheck and `npm run test:coverage` (the 90% gate), uploads the coverage report as an artifact, and checks that the PR title follows Conventional Commits.
- **Release** (`.github/workflows/release.yml`): on push to `main`, re-runs the checks and then runs semantic-release.

Recommended repository setting: protect `main` so changes must go through a pull request and the CI check passes before merging. In GitHub, open the repository's **Settings -> Rules -> Rulesets** (or **Settings -> Branches**), target the default branch, require a pull request, and require the status check named **Typecheck and test (90% coverage gate)**. (The check only appears in the picker after it has run at least once.)

## Releases and versioning

Versions are automated with [semantic-release](https://semantic-release.gitbook.io). Every merge to `main` is analysed, and when it contains a releasable change, a version tag (`vX.Y.Z`) and a GitHub Release with generated notes are created. Releases are the changelog: see the repository's Releases page. `package.json` stays at `0.0.0-development` on purpose.

The version bump comes from the commit message, so use [Conventional Commits](https://www.conventionalcommits.org). With squash merging, the **PR title** is the commit message:

| Prefix | Example | Release |
| --- | --- | --- |
| `fix:` | `fix: stop retakers getting a second style tag` | patch (1.0.0 to 1.0.1) |
| `feat:` | `feat: add wedding month to the email screen` | minor (1.0.0 to 1.1.0) |
| `feat!:` or a `BREAKING CHANGE:` footer | `feat!: rename Kit custom fields` | major (1.0.0 to 2.0.0) |
| `docs:`, `chore:`, `test:`, `refactor:`, `ci:` | `docs: update Kit setup` | no release |

The first release (no earlier tags) is `v1.0.0`.

Deploys are separate: Vercel deploys `main` to production on every merge, whether or not a release was cut.

## Testing checklist

### Before deployment

- `npm run ci` passes (typecheck, tests, 90% coverage).
- `.env` is not tracked by Git.
- If `VENUE_SHEET_CSV_URL` is set, opening it directly in a browser returns raw CSV text.
- `/api/match` rejects invalid email and missing consent.
- Budget and guest capacity behave as hard filters.
- The closest-match state appears when no eligible venues pass both filters.

### After deployment

- Open the Vercel URL directly and complete the quiz.
- Submit a test email and confirm the result appears.
- Confirm the response includes `kitSync: "ok"` (or `"skipped"` if `KIT_API_KEY` is unset).
- Confirm the test subscriber appears in Kit with the "Quiz taker" tag, one style tag, and all four custom fields. Kit's subscriber list can lag a few minutes behind a write.
- Unsubscribe or delete the test subscriber afterward.
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
