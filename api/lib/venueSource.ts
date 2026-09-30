import { readFileSync } from "fs";
import { join } from "path";
import { parseVenueCsv } from "./importVenues";
import type { VenueRow } from "./types";

// Venue data has two modes:
//
// 1. Static (default, current test phase): `data/venues.csv` is committed to the repo and read from
//    disk. Updating venue data means editing that file and redeploying. No external dependency.
// 2. Published Google Sheet: set VENUE_SHEET_CSV_URL and the CSV is fetched over the network and
//    cached in memory per warm container, so sheet edits go live within CACHE_TTL_MS.
//
// Mode 2 is the eventual production setup; mode 1 keeps the deploy self-contained while the quiz
// is still being validated.
const CACHE_TTL_MS = 5 * 60 * 1000;

const STATIC_CSV_PATH = join(process.cwd(), "data", "venues.csv");

export type VenueSourceKind = "static-file" | "published-sheet";

interface VenueCache {
  venues: VenueRow[];
  warnings: string[];
  source: VenueSourceKind;
  fetchedAt: number;
}

let cache: VenueCache | null = null;

async function readCsvText(): Promise<{ csvText: string; source: VenueSourceKind }> {
  const sheetUrl = process.env.VENUE_SHEET_CSV_URL;

  if (sheetUrl) {
    const response = await fetch(sheetUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch the venue sheet (${response.status})`);
    }
    return { csvText: await response.text(), source: "published-sheet" };
  }

  return { csvText: readFileSync(STATIC_CSV_PATH, "utf8"), source: "static-file" };
}

export async function getVenues(): Promise<VenueCache> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  const { csvText, source } = await readCsvText();
  const { records, warnings } = parseVenueCsv(csvText);

  cache = {
    venues: records.map((record) => ({ id: record.slug, ...record })),
    warnings: warnings.map((warning) => `${warning.venueName}: ${warning.message}`),
    source,
    fetchedAt: Date.now(),
  };
  return cache;
}
