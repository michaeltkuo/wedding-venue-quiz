# Ranking research: can an ML model replace the scoring system?

November 2026. Question asked: instead of hand-tuned points, can the quiz match couples to venues by
similarity between the answer wording and what the venue database says, or with a classification/ML
model?

## Short answer

- **A trained classifier or recommender is not possible yet.** It needs examples of the right answer:
  couples and the venue they chose, liked or booked. The quiz has none. Each "class" (venue) would
  have zero training examples, and 40 venues is too few to learn from without them.
- **Semantic similarity (sentence embeddings) works, but only for how a venue should *feel*.** The
  wording of the style and "feel" answers measurably finds the right venues from the sheet's free
  text. The wording of logistics answers (catering, indoor, micro wedding) does not: it scores no
  better than chance, so those must stay rules on the sheet's columns.
- **What was built:** a hybrid, opt-in with `RANKING_MODE=semantic`. Requirements, style groups and
  logistics stay rule-based. The flag-based "feel" bonuses are replaced by embedding similarity. The
  vectors are precomputed offline and committed, so production does only arithmetic: no model, no API
  key, no added latency, same answers always give the same result.
- **Turn it on after review, not before.** It changes the top match in about half of answer
  combinations. Several changes look like clear improvements (below), but there is no outcome data to
  prove it, so Amy should review `npm run compare:ranking` first.

## Options considered

| Approach | Verdict | Why |
| --- | --- | --- |
| Supervised classifier (answers → venue) | Not possible now | No labelled outcomes; 40 classes with zero examples each. |
| Collaborative filtering / learning-to-rank | Not possible now | Needs interaction data (clicks, inquiries, bookings). See "Path to a real ML model". |
| Structured-feature cosine similarity (the Asana "similarity" task) | No gain | Mathematically a normalized weighted score over the same columns; it would reproduce the current system. |
| Keyword TF-IDF over venue text | Works about as well as embeddings on style, no model at all | Purely lexical: "Something Distinctive" cannot match "one-of-a-kind". |
| **Sentence embeddings, precomputed** | **Built (opt-in)** | Captures meaning, not just shared words; zero runtime cost. |
| Embeddings computed at request time | Rejected | The model runtime is ~380 MB installed, over Vercel's 250 MB function limit; an embeddings API would add a key, cost and a network hop for no accuracy gain, since every answer is a fixed option. |
| LLM (e.g. Claude) re-ranking per request | Rejected for ranking | Adds 1–3 s, cost per quiz and an API dependency, and the prototype spec rules out LLM ranking without a deterministic fallback. Still a good offline tool for judging rankings (see below). |

## Experiments

All run against the 40 launch-eligible venues in `data/venues.csv`, using the quiz's exact answer
wording (title + description). Models were run locally with transformers.js.

### 1. Does answer wording find the right style from venue text?

Amy's curated "Primary Style / Vibe" column is a ready-made answer key. Each Q1 answer's wording was
compared to every venue's free text (Photography Notes, Best For, and the two descriptions), with the
style column itself hidden. Mean average precision (1.0 = all venues of that style ranked first):

| Method | MAP, any listed style | MAP, first-listed style | Top-4 precision |
| --- | --- | --- | --- |
| Random order | 0.47 | 0.27 | ~0.47 |
| TF-IDF keywords (no ML) | 0.73–0.78 | 0.53–0.61 | 0.85–0.90 |
| all-MiniLM-L6-v2 | 0.72–0.74 | 0.55–0.58 | 0.80–0.95 |
| bge-small / bge-base | 0.73–0.79 | 0.60–0.65 | 0.75–0.90 |
| **gte-small (chosen)** | **0.76–0.79** | **0.64–0.67** | **0.75–1.00** |
| gte-base, nomic-embed, mxbai-large | 0.76–0.81 | 0.61–0.68 | 0.85–0.95 |

Ranges are across three choices of venue text. Takeaways: similarity finds real signal (well above
random); bigger models are not better on data this small; and the curated label is still the most
reliable style signal, which is why style groups stay rule-based on that column. gte-small was chosen
as the smallest model at the top of the range.

Leaving "Not Ideal For" out of the venue text helped slightly for most models: embeddings ignore negation, so "not
ideal for couples wanting a garden" reads as garden-like.

### 2. Can answer wording replace the sheet's Yes/No columns?

Same test, answer key = the column itself (gte-small):

| Answer | Venues with "Yes" | Average precision | Random |
| --- | --- | --- | --- |
| Overnight Stay | 8 | 0.39 | 0.20 |
| Weather Backup | 34 | 0.91 | 0.85 |
| Vendor Flexibility | 15 | 0.39 | 0.38 |
| Primarily Indoor | 19 | 0.58 | 0.47 |
| Up To 50 (micro wedding) | 35 | 0.84 | 0.88 |

No better than chance for most, so the venue text simply does not carry this information reliably.
Logistics stay rules on the columns.

### 3. How much does the score matter, and what changes?

Removing the weighted score (leaving only the style and requirement tiers) changes the shown top four
in 96.5% of answer combinations, so the score does real work and improving it matters. With the semantic mode on (1,920 combinations of style,
priority, portrait perk, guests, budget and setting):

- Same top match: 54%
- Same four venues, any order: 44%
- Average venues in common: 3.26 of 4

Run `npm run compare:ranking` for the full side-by-side. Representative differences (100 guests,
flexible budget, open setting):

| Couple | Rules top match | Semantic top match |
| --- | --- | --- |
| Relaxed + Rustic ("Barns, wood, natural texture") | Historic Dubsdread Ballroom | Hidden Barn Venue |
| Old-World Character ("Historic homes, arches, courtyards") | Highland Manor | Casa Feliz (Spanish arches, courtyard) |
| Modern + Editorial + Portrait Potential | History Center; runners-up Legacy at Oak Meadows, Lake Mary Events Center, Wanderlust Okto | Orlando Museum of Art; runners-up Museum of Arts and Sciences, Orlando Science Center, History Center |
| Classic Elegance + A Beautiful Setting | Loews Portofino Bay (1,300 capacity) | Luxmore Grande Estate |

Why the rules pick some of these: many venues tie on the rule score, and the final tie-break is
largest capacity, so big ballrooms and resorts float up for a 100-guest couple. Similarity breaks
those ties on what the venue is actually like.

## What was built

- `api/lib/semantic.ts`: loads `data/venue-embeddings.json` and turns similarity into 0–20 points
  (`SEMANTIC_WEIGHT`), rescaled across the venue pool so the closest venue gets 20 and the furthest 0.
- `api/lib/ranking.ts`: with an index, `scoreVenue` drops the flag-based Portrait Potential (perk),
  A Beautiful Setting and Something Distinctive (priority) bonuses, worth up to 16, and adds the
  similarity points. Everything above the score is unchanged: style group first, then requirements,
  then guest fit, then misses. Similarity can never lift a venue that misses a requirement above one
  that meets them all.
- `api/match.ts`: `RANKING_MODE=semantic` turns it on. If the embeddings file cannot be read, it logs
  an error and uses the rules; results are never blocked. The response includes `rankingMode`.
- `scripts/embeddings/`: the offline builder (own `package.json`, so the model runtime is never
  installed by CI or bundled by Vercel). Answer wording is read straight from `embed-app.html`.
- `tests/semantic.test.ts`: unit tests, plus a guard that fails CI if `data/venues.csv` or the quiz
  wording changed without re-running `npm run embed`.

Which answers use similarity is set in `FEEL_ANSWERS` (`api/lib/semantic.ts`): every Q1 style,
the "photos" and "unique" priorities, and the Portrait Potential perk. Guest Comfort and Best Value
stay rules (capacity headroom and the under-$2k bucket are facts in the sheet).

### Live Google Sheet mode

With `VENUE_SHEET_CSV_URL` set, sheet edits go live without a deploy, so a venue's text can change
after its vector was built. Each vector stores a hash of the text it came from; a venue whose text no
longer matches (or a new venue) is placed at the midpoint, neither rewarded nor buried, until
`npm run embed` is re-run against the updated CSV and committed.

## Turning it on

1. Run `npm run compare:ranking > comparison.md` and review it with Amy.
2. In Vercel, set `RANKING_MODE=semantic` for Preview first, test, then Production, and redeploy.
3. To turn it off, remove the variable and redeploy.

## Path to a real ML model

The limiting factor is data, not models. To make a trained ranker possible:

1. **Record outcomes.** Kit already tracks link clicks per subscriber, and every results email links
   each venue. Clicks on the top match vs. runners-up are implicit feedback. Better still: which venue
   a couple inquires about or books with Author Made.
2. **Log answers with results** (anonymous, no email) so outcomes can be joined to what the quiz
   showed.
3. With a few hundred outcomes, fit a simple learning-to-rank model (e.g. logistic regression on the
   existing features plus the similarity score) and compare it with the current mode offline.
4. Until then, an LLM can act as a judge: generate the top four for a few hundred answer
   combinations under each mode and have Amy (or Claude, checked against Amy) mark the better list.
   That turns "looks better" into a measured win rate.
