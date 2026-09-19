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
import type { VenueRow } from "./types";

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

// Column names must match the header row of "Author_Made_Venue_Quiz_Database_V2.xlsx - Venue Database.csv"
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

    const budget = normalizeBudget(row["Price / Budget Fit"]);
    const capacity = normalizeCapacity(row["Max. Guest Capacity"]);
    const launchEligible = budget.eligible && capacity.eligible;
    const reasons: string[] = [];
    if (!budget.eligible) reasons.push("Price / Budget Fit is blank, TBD, or not established");
    if (!capacity.eligible) reasons.push("Max. Guest Capacity is blank, TBD, or has no usable upper bound");

    if (!launchEligible) {
      warnings.push({ venueName: name, message: `Excluded from matching: ${reasons.join("; ")}.` });
    }

    records.push({
      slug: slugify(name),
      name,
      city_area: row["City / Area"]?.trim() || null,
      region: deriveRegion(row["City / Area"]),
      budget_label: row["Price / Budget Fit"]?.trim() || null,
      budget_buckets: budget.buckets,
      capacity_max: capacity.max,
      indoor_support: normalizeTriState(row["Indoor"]),
      outdoor_support: normalizeTriState(row["Outdoor"]),
      primary_vibe: row["Primary Style / Vibe"]?.trim() || null,
      micro_wedding_fit: normalizeBoolean(row["Micro-Wedding Fit"]),
      garden_flag: normalizeBoolean(row["Garden / Botanical"]),
      historic_flag: normalizeBoolean(row["Historic"]),
      european_flag: normalizeBoolean(row["European / Old-World"]),
      source_type_tags: splitList(row["Appears In / Source Type"]),
      source_url: row["Primary Source URL"]?.trim() || null,
      starting_price_numeric: normalizeNumeric(row["Starting Price (numeric)"]),
      price_notes: row["Price Notes / Caveats"]?.trim() || null,
      ceremony_reception: normalizeTriState(row["Ceremony + Reception?"]),
      reception_only: normalizeTriState(row["Reception Only?"]),
      weather_backup: normalizeTriState(row["Weather Backup"]),
      getting_ready: normalizeTriState(row["Getting Ready"]),
      overnight_accommodation: normalizeTriState(row["Overnight Accommodation"]),
      catering: row["Catering"]?.trim() || null,
      outside_vendors: row["Outside Vendors"]?.trim() || null,
      photo_notes: row["Photography / Visual Notes"]?.trim() || null,
      best_for: row["Best For / Couple Type"]?.trim() || null,
      not_ideal_for: row["Not Ideal For"]?.trim() || null,
      review_url: row["Author Made Venue Review"]?.trim() || null,
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
