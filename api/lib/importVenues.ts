import { parse } from "csv-parse/sync";
import {
  deriveRegion,
  normalizeBoolean,
  normalizeBudget,
  normalizeCapacity,
  normalizeNumeric,
  normalizeTriState,
  slugify,
  splitList,
} from "./normalize";
import type { TriState, VenueRow } from "./types";

export type ImportedVenue = Omit<VenueRow, "id">;

export interface ImportWarning {
  venueName: string;
  message: string;
}

export interface ImportResult {
  records: ImportedVenue[];
  warnings: ImportWarning[];
}

type CsvRow = Record<string, string>;

// The 09.10.2026 sheet dropped the standalone `Garden / Botanical`, `Historic`, and
// `European / Old-World` columns; those traits now live inside the free-text style vocabulary
// ("Garden Romance", "Old-World Character", ...). Derive them from that text rather than from
// columns that no longer exist.
function styleText(row: CsvRow): string {
  return [row["Primary Style / Vibe"], row["Photography / Visual Notes"], row["Appears In / Source Type"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// First non-blank value among the given header names. The 10.26.2026 sheet renamed or split a few
// columns, so the importer accepts the new header and falls back to the older one.
function pick(row: CsvRow, ...headers: string[]): string {
  for (const header of headers) {
    const value = row[header]?.trim();
    if (value) return value;
  }
  return "";
}

// "Has Author Made Venue Review?" holds either the review link or the word "No"; only a real link
// should ever reach the results page.
function urlOrNull(raw: string): string | null {
  return /^https?:\/\//i.test(raw) ? raw : null;
}

// The 10.26.2026 sheet replaced the single Indoor/Outdoor columns with separate ceremony and
// reception columns. The quiz's setting score still works from one indoor and one outdoor signal,
// so combine them here. A conditional "Yes (70 guests or less)" is only a partial yes: the space
// exists but not for every guest count.
const SETTING_COLUMNS = {
  indoor: ["Indoor Ceremony (EXCLUDING weather backup option)", "Indoor Reception"],
  outdoor: ["Outdoor Ceremony", "Outdoor Reception"],
} as const;

function settingSupport(row: CsvRow, kind: "indoor" | "outdoor"): TriState {
  const legacy = row[kind === "indoor" ? "Indoor" : "Outdoor"];
  if (legacy !== undefined && !(kind === "indoor" ? SETTING_COLUMNS.indoor : SETTING_COLUMNS.outdoor).some((h) => row[h] !== undefined)) {
    return normalizeTriState(legacy);
  }
  const states = SETTING_COLUMNS[kind].map((header): TriState => {
    const text = (row[header] ?? "").trim();
    if (/^yes\s*\(/i.test(text)) return "partial";
    return normalizeTriState(text);
  });
  if (states.includes("yes")) return "yes";
  if (states.includes("partial")) return "partial";
  if (states.includes("no")) return "no";
  return "unknown";
}

// Column names must match the header row of "data/venues.csv"
// (and the published Google Sheet, which should mirror the same columns).
export function parseVenueCsv(csvText: string): ImportResult {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];
  const records: ImportedVenue[] = [];
  const warnings: ImportWarning[] = [];

  for (const row of rows) {
    const name = row["Venue Name"]?.trim();
    if (!name) {
      warnings.push({ venueName: "(unnamed row)", message: "Skipped: missing Venue Name." });
      continue;
    }

    const budget = normalizeBudget(row["Under $2k?"], row["Under $5k?"]);
    const capacity = normalizeCapacity(row["Max. Guest Capacity"]);
    const launchEligible = budget.eligible && capacity.eligible;
    const reasons: string[] = [];
    if (!budget.eligible) reasons.push("Under $2k? and Under $5k? are both blank or hedged");
    if (!capacity.eligible) reasons.push("Max. Guest Capacity is blank, TBD, or has no usable upper bound");

    if (!launchEligible) {
      warnings.push({ venueName: name, message: `Excluded from matching: ${reasons.join("; ")}.` });
    }

    records.push({
      slug: slugify(name),
      name,
      city_area: row["City / Area"]?.trim() || null,
      region: deriveRegion(row["City / Area"]),
      budget_label: budget.label,
      budget_buckets: budget.buckets,
      capacity_max: capacity.max,
      indoor_support: settingSupport(row, "indoor"),
      outdoor_support: settingSupport(row, "outdoor"),
      primary_vibe: row["Primary Style / Vibe"]?.trim() || null,
      micro_wedding_fit: normalizeBoolean(row["Micro-Wedding Fit"]),
      garden_flag: /garden|botanical/.test(styleText(row)),
      historic_flag: /historic/.test(styleText(row)),
      european_flag: /old-world|old world|european/.test(styleText(row)),
      source_type_tags: splitList(row["Appears In / Source Type"]),
      source_url: urlOrNull(pick(row, "Primary Source URL")),
      starting_price_numeric: normalizeNumeric(row["Starting Price (numeric)"]),
      price_notes: row["Price Notes / Caveats"]?.trim() || null,
      ceremony_reception: normalizeTriState(row["Ceremony + Reception?"]),
      reception_only: normalizeTriState(row["Reception Only?"]),
      weather_backup: normalizeTriState(row["Weather Backup"]),
      getting_ready: normalizeTriState(row["Getting Ready"]),
      overnight_accommodation: normalizeTriState(row["Overnight Accommodation"]),
      catering: pick(row, "In-House or Required Vendor Catering", "Catering") || null,
      outside_vendors: pick(row, "Outside Catering Allowed?", "Outside Vendors") || null,
      photo_notes: row["Photography / Visual Notes"]?.trim() || null,
      best_for: row["Best For / Couple Type"]?.trim() || null,
      not_ideal_for: row["Not Ideal For"]?.trim() || null,
      review_url: urlOrNull(pick(row, "Has Author Made Venue Review?", "Author Made Venue Review")),
      last_verified: row["Last Verified"]?.trim() || null,
      verification_needed: normalizeBoolean(row["Verification Needed?"]),
      pricing_data_date: row["Pricing Data Date"]?.trim() || null,
      research_status: row["Research Status"]?.trim() || null,
      launch_eligible: launchEligible,
      launch_ineligibility_reason: launchEligible ? null : reasons.join("; "),
      hero_image_url: null,
    });
  }

  return { records, warnings };
}
