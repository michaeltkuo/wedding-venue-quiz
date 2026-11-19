import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CSV = [
  "Venue Name,City / Area,Under $2k?,Under $5k?,Max. Guest Capacity",
  "Alpha Hall,Orlando,Yes,Yes,100",
  "Broken Hall,Orlando,,,TBD",
].join("\n");

async function load() {
  vi.resetModules();
  return import("../api/lib/venueSource");
}

beforeEach(() => {
  delete process.env.VENUE_SHEET_CSV_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.VENUE_SHEET_CSV_URL;
});

describe("getVenues", () => {
  it("reads the committed CSV by default", async () => {
    const { getVenues } = await load();
    const result = await getVenues();
    expect(result.source).toBe("static-file");
    expect(result.venues.length).toBeGreaterThan(10);
    expect(result.venues[0].id).toBe(result.venues[0].slug);
  });

  it("fetches the published sheet when VENUE_SHEET_CSV_URL is set, with warnings for bad rows", async () => {
    process.env.VENUE_SHEET_CSV_URL = "https://sheet.example/csv";
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => CSV }));
    vi.stubGlobal("fetch", fetchMock);
    const { getVenues } = await load();
    const result = await getVenues();
    expect(fetchMock).toHaveBeenCalledWith("https://sheet.example/csv");
    expect(result.source).toBe("published-sheet");
    expect(result.venues.map((v) => v.id)).toEqual(["alpha-hall", "broken-hall"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^Broken Hall: Excluded from matching/);
  });

  it("caches for five minutes, then refetches", async () => {
    process.env.VENUE_SHEET_CSV_URL = "https://sheet.example/csv";
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => CSV }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const { getVenues } = await load();
    await getVenues();
    await getVenues();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await getVenues();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a clear error when the sheet cannot be fetched", async () => {
    process.env.VENUE_SHEET_CSV_URL = "https://sheet.example/csv";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })));
    const { getVenues } = await load();
    await expect(getVenues()).rejects.toThrow("Could not fetch the venue sheet (404)");
  });
});
