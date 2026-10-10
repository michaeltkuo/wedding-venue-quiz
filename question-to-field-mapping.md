# Question-to-Field Mapping for the Venue Quiz

This mapping connects each quiz question to the most relevant columns in the venue database so the questionnaire can filter and rank venues correctly.

## Recommended rule

- Hard filter questions: use exact database columns to exclude venues.
- Preference questions: use database columns to score/rank venues.
- Multi-select questions: use one or more boolean/feature columns.

## Mapping table

| # | Quiz question | Match type | Primary database column(s) | Secondary / supporting columns | Notes |
|---|---|---|---|---|---|
| 1 | What should your venue feel like the moment you arrive? | Preference / scoring | `Primary Style / Vibe` | `Garden / Botanical`, `Historic`, `European / Old-World`, `Photography / Visual Notes`, `Best For / Couple Type` | This is the style fit question. It should mostly be a ranking input rather than a hard filter. |
| 2 | About how many people are you inviting? | Hard filter | `Max. Guest Capacity` | `Micro-Wedding Fit` | This is the core capacity filter. It should compare guest count against venue capacity. |
| 3 | What is your comfort zone for the venue rental? | Hard filter | `Price / Budget Fit`, `Starting Price (numeric)` | `Price Notes / Caveats` | Use this to filter by pricing tier or price ceiling. |
| 4 | What kind of celebration are you planning at the venue? | Preference / scoring | `Ceremony + Reception?`, `Reception Only?` | `Best For / Couple Type` | Determines whether the venue supports a full-day structure or is primarily reception-focused. |
| 5 | How do you want the space to work with the Florida weather? | Preference / scoring | `Indoor`, `Outdoor`, `Weather Backup` | `Ceremony + Reception?` | This is mainly a venue-format preference: indoor-first, outdoor-first, or flexible. |
| 6 | Which part of Central Florida feels most convenient? | Hard filter | `City / Area` | `Venue Name` | This should filter by geography/location area. |
| 7 | Are any of these a dealbreaker for your venue? (pick one, or none) | Penalty (never removes a venue) | `Primary Style / Vibe` (rustic / modern / old-world; first-listed style penalized fully, later ones lightly), `Indoor` (outdoor-only ceremony), `City / Area` (long drive), `Catering` (required in-house caterer) | `Micro-Wedding Fit` now boosts venues when Q2 is "Up to 50" | Replaced the micro-wedding question. Data cleanups for Amy (Catering column, optional Ceremony setting column, far-city list) are noted on the Q7 Asana task. |
| 8 | Which extras would make the venue feel especially right? | Multi-select / scoring | `Weather Backup`, `Overnight Accommodation`, `Catering`, `Outside Vendors`, `Getting Ready` | `Photography / Visual Notes`, `Best For / Couple Type` | This should be treated as a multi-select feature filter and score booster. |
| 9 | What kind of venue experience sounds most helpful? | Preference / scoring | `Catering`, `Outside Vendors`, `Getting Ready` | `Price / Budget Fit`, `Best For / Couple Type` | This captures whether the venue should feel hands-on/full-service or flexible/self-directed. |
| 10 | When you picture the right venue, what matters most? | Preference / scoring | `Primary Style / Vibe`, `Photography / Visual Notes`, `Best For / Couple Type` | `Max. Guest Capacity`, `Price / Budget Fit`, `Weather Backup` | This is the final prioritization question; it should heavily influence ranking weight. |

## Field-by-field summary

These are the database fields that matter most across the quiz:

- `Venue Name`
- `City / Area`
- `Price / Budget Fit`
- `Starting Price (numeric)`
- `Max. Guest Capacity`
- `Indoor`
- `Outdoor`
- `Primary Style / Vibe`
- `Micro-Wedding Fit`
- `Garden / Botanical`
- `Historic`
- `European / Old-World`
- `Ceremony + Reception?`
- `Reception Only?`
- `Weather Backup`
- `Getting Ready`
- `Overnight Accommodation`
- `Catering`
- `Outside Vendors`
- `Photography / Visual Notes`
- `Best For / Couple Type`

## Best implementation pattern

Use this split:

1. Hard filters
   - `City / Area`
   - `Price / Budget Fit`
   - `Max. Guest Capacity`
   - `Micro-Wedding Fit`
   - maybe `Indoor` / `Outdoor` depending on answer specificity

2. Ranking / scoring
   - `Primary Style / Vibe`
   - `Garden / Botanical`
   - `Historic`
   - `European / Old-World`
   - `Weather Backup`
   - `Catering`
   - `Outside Vendors`
   - `Overnight Accommodation`
   - `Photography / Visual Notes`
   - `Best For / Couple Type`

## Practical interpretation

The quiz is basically a two-step process:

- Step 1: narrow the pool using location, budget, guest count, and event format.
- Step 2: rank the remaining venues based on aesthetic style, venue features, weather practicality, and planning preferences.

That means the data model should not treat every question as a strict column equality check. Several questions are better handled as weighted preference scores rather than exact match rules.
