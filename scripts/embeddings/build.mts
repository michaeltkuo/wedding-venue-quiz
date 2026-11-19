// Builds data/venue-embeddings.json for RANKING_MODE=semantic (see api/lib/semantic.ts).
//
//   npm run embed:install   # once: installs the model runtime into scripts/embeddings/
//   npm run embed           # re-run after editing data/venues.csv or quiz answer wording
//
// Runs entirely on this machine. The model (~130 MB) downloads from Hugging Face on first use and is
// cached in scripts/embeddings/.model-cache/ (git-ignored).
import { env, pipeline } from "@huggingface/transformers";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseVenueCsv } from "../../api/lib/importVenues";
import { isFeelAnswer, semanticAnswerText, semanticVenueText, textHash, type SemanticIndex } from "../../api/lib/semantic";
import type { VenueRow } from "../../api/lib/types";
import { extractQuizOptions } from "../quizOptions";

// gte-small: 33M parameters, 384 dimensions. Chosen in docs/ranking-research.md (best or tied-best on
// recovering the sheet's curated style labels; larger models were no better on this data).
const MODEL = "Xenova/gte-small";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
env.cacheDir = join(here, ".model-cache");

const csv = readFileSync(join(root, "data", "venues.csv"), "utf8");
const venues = parseVenueCsv(csv).records.map((record) => ({ id: record.slug, ...record }) as VenueRow);
const options = extractQuizOptions(readFileSync(join(root, "embed-app.html"), "utf8")).filter((option) =>
  isFeelAnswer(option.question, option.value)
);

const extractor = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });
async function embed(text: string): Promise<number[]> {
  const output = await extractor(text, { pooling: "mean", normalize: true });
  // 5 decimals keeps the file small; the rounding error is far below anything that changes a ranking.
  return Array.from(output.data as Float32Array, (x) => Math.round(x * 1e5) / 1e5);
}

const index: SemanticIndex = { model: MODEL, answers: {}, venues: {} };

for (const option of options) {
  const text = semanticAnswerText(option.title, option.description);
  index.answers[`${option.question}:${option.value}`] = { hash: textHash(text), vector: await embed(text) };
}

let skipped = 0;
for (const venue of [...venues].sort((a, b) => a.slug.localeCompare(b.slug))) {
  const text = semanticVenueText(venue);
  if (!text) {
    skipped++;
    console.warn(`  ${venue.name}: no photo notes, best-for or description text; it will score at the midpoint.`);
    continue;
  }
  index.venues[venue.slug] = { hash: textHash(text), vector: await embed(text) };
}

const out = join(root, "data", "venue-embeddings.json");
writeFileSync(out, JSON.stringify(index) + "\n");
console.log(`Wrote ${Object.keys(index.answers).length} answer and ${Object.keys(index.venues).length} venue vectors (${skipped} venues without text) to data/venue-embeddings.json`);
