# Contributing

The quiz runs on a single live environment, so changes are verified by automated tests before they merge.

## Workflow

1. Branch from `main`.
2. Make the change and add or update tests in `tests/`.
3. Run `npm run ci` (typecheck plus tests with the 90% coverage gate). Fix anything that fails.
4. Update the README or other docs if setup, env vars, or behavior changed.
5. Open a pull request. The PR title must follow [Conventional Commits](https://www.conventionalcommits.org) (see `README.md`, "Releases and versioning"), for example `feat: add wedding month question` or `fix: handle blank style cells`.
6. CI must pass. Merge with **squash** so the PR title becomes the commit message that semantic-release reads.

Merging to `main` deploys to production on Vercel and, for `feat`/`fix` changes, cuts a tagged GitHub Release automatically.

## Testing notes

- Tests live in `tests/`, not `api/`: Vercel turns every file in `api/` into a serverless endpoint.
- Never call the real Kit API from tests. `tests/kit.test.ts` stubs `fetch`; `tests/match.test.ts` mocks the Kit module.
- Coverage is measured on `api/**` and must stay at or above 90% for lines, branches, functions and statements (`vitest.config.mts`).
- If you change venue text in `data/venues.csv` or answer wording in `embed-app.html`, run `npm run embed` (after a one-time `npm run embed:install`) and commit `data/venue-embeddings.json`. `tests/semantic.test.ts` fails until you do.
- If you change the venue sheet's columns or style names, `tests/importVenues.test.ts` checks that every launch-eligible venue still maps to one of the five Kit style tags.
- The browser UI (`embed-app.html`) has no automated tests. Check it by hand: open `embed-app.html?mock=1&start=1` locally.

## Changing Kit tags or fields

Tag names and custom field keys are defined in `api/lib/tags.ts` and must match Kit exactly, because the welcome automations trigger on the style tags. If you rename one, rename it in Kit, `api/lib/tags.ts` and the "Email Launch Plan" doc together, and update the tests.

## Secrets

Never commit `.env` or paste `KIT_API_KEY` into code, chat, Slack or email. The key lives only in Vercel environment variables (Production and Preview) and, for local runs, in an untracked `.env`.
