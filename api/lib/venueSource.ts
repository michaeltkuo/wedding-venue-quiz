import { parseVenueCsv } from "./importVenues";
import type { VenueRow } from "./types";

// No database: the published Google Sheet CSV is fetched and cached in memory per warm container.
// Edits to the sheet go live within CACHE_TTL_MS - no separate "import" step required.
const CACHE_TTL_MS = 5 * 60 * 1000;

interface VenueCache {
  venues: VenueRow[];
  warnings: string[];
  fetchedAt: number;
}

let cache: VenueCache | null = null;

export async function getVenues(): Promise<VenueCache> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  const sheetUrl = process.env.VENUE_SHEET_CSV_URL;
  if (!sheetUrl) {
    throw new Error("VENUE_SHEET_CSV_URL is not set");
  }

  const response = await fetch(sheetUrl);
  if (!response.ok) {
    throw new Error(`Could not fetch the venue sheet (${response.status})`);
  }

  const csvText = await response.text();
  const { records, warnings } = parseVenueCsv(csvText);

  cache = {
    venues: records.map((record) => ({ id: record.slug, ...record })),
    warnings: warnings.map((warning) => `${warning.venueName}: ${warning.message}`),
    fetchedAt: Date.now(),
  };
  return cache;
}
