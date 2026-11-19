// Side-by-side results for the rule-based score vs. RANKING_MODE=semantic, for reviewing before the
// semantic mode is turned on.
//
//   npm run compare:ranking            # Markdown to stdout
//   npm run compare:ranking > out.md
import { readFileSync } from "fs";
import { join } from "path";
import { parseVenueCsv } from "../api/lib/importVenues";
import { rankVenues } from "../api/lib/ranking";
import { loadSemanticIndex } from "../api/lib/semantic";
import type { QuizAnswers, VenueRow } from "../api/lib/types";

const root = join(__dirname, "..");
const venues: VenueRow[] = parseVenueCsv(readFileSync(join(root, "data", "venues.csv"), "utf8"))
  .records.filter((record) => record.launch_eligible)
  .map((record) => ({ id: record.slug, ...record }));
const index = loadSemanticIndex(join(root, "data", "venue-embeddings.json"));

const names = (answers: QuizAnswers, semantic: boolean) =>
  rankVenues(venues, answers, semantic ? index : null).venues.map((venue) => venue.name);

// Every combination of the answers the semantic mode reads, crossed with common requirement answers.
const VIBES = ["garden", "european", "modern", "rustic", "classic"];
const PRIORITIES = ["photos", "unique", "guestComfort", "value"];
const PERKS: string[][] = [[], ["photos"]];
const GUESTS = [50, 100, 150, 200];
const BUDGETS = ["under-2k", "under-5k", "flexible"];
const SETTINGS = ["open", "outdoor", "indoor", "both"];

let total = 0;
let sameTop = 0;
let sameSet = 0;
let overlap = 0;
for (const vibe of VIBES) for (const priority of PRIORITIES) for (const perks of PERKS)
  for (const guestMinimum of GUESTS) for (const budget of BUDGETS) for (const setting of SETTINGS) {
    const answers: QuizAnswers = { vibe, priority, perks, guestMinimum, budget, setting };
    const rules = names(answers, false);
    const semantic = names(answers, true);
    total++;
    if (rules[0] === semantic[0]) sameTop++;
    if (rules.every((name) => semantic.includes(name))) sameSet++;
    overlap += rules.filter((name) => semantic.includes(name)).length;
  }

const pct = (n: number) => `${((100 * n) / total).toFixed(0)}%`;
const lines: string[] = [
  `## Rules vs. semantic: ${total} answer combinations`,
  "",
  `- Same top match: ${pct(sameTop)}`,
  `- Same four venues (any order): ${pct(sameSet)}`,
  `- Average venues in common: ${(overlap / total).toFixed(2)} of 4`,
  "",
  "## Sample couples (100 guests, flexible budget, open setting, so style and feel decide)",
  "",
  "| Style | Priority | Portrait perk | Rules: top + runners-up | Semantic: top + runners-up |",
  "| --- | --- | --- | --- | --- |",
];
for (const vibe of VIBES) for (const priority of ["photos", "unique"]) for (const perks of PERKS) {
  const answers: QuizAnswers = { vibe, priority, perks, guestMinimum: 100, budget: "flexible", setting: "open" };
  const rules = names(answers, false);
  const semantic = names(answers, true);
  const cell = (list: string[], other: string[]) =>
    list.map((name, i) => (i === 0 ? `**${name}**` : other.includes(name) ? name : `_${name}_`)).join("<br>");
  lines.push(`| ${vibe} | ${priority} | ${perks.length ? "yes" : "no"} | ${cell(rules, semantic)} | ${cell(semantic, rules)} |`);
}
lines.push("", "Bold = top match. _Italic_ = shown by only one of the two modes.");
console.log(lines.join("\n"));
