import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseVenueCsv } from "../api/lib/importVenues";
import { STYLE_TAG_NAMES, topStyleForVenue } from "../api/lib/tags";

const NEW_HEADERS = [
  "Venue Name",
  "City / Area",
  "Under $2k?",
  "Under $5k?",
  "Max. Guest Capacity",
  "Indoor Ceremony (EXCLUDING weather backup option)",
  "Outdoor Ceremony",
  "Indoor Reception",
  "Outdoor Reception",
  "Primary Style / Vibe",
  "Micro-Wedding Fit",
  "Appears In / Source Type",
  "Has Author Made Venue Review?",
  "Hero Image URL",
  "Outside Catering Allowed?",
  "In-House or Required Vendor Catering",
  "Top Match Description",
  "Runners-Up Description",
].join(",");

function csv(headers: string, ...rows: string[]): string {
  return [headers, ...rows].join("\n");
}

describe("parseVenueCsv (current sheet layout)", () => {
  const text = csv(
    NEW_HEADERS,
    "Leu Gardens,Orlando,Yes,Yes,180,No,Yes,Yes,No,Garden Romance / Classic Elegance,Yes,Garden; Historic,https://example.com/review,https://example.com/hero.jpg,No,must use caterer,Top copy,Runner copy",
    "Casa Feliz,Winter Park,No,Yes,Up to 120,Yes,Yes,Yes (70 guests or less),Yes,Old-World Character,No,European,No,not a url,Yes,,,",
    "Intimate Spot,Maitland,No,Yes,60,Yes,No,Yes (intimate weddings only),No,Modern + Editorial,No,,,,,,,"
  );
  const { records, warnings } = parseVenueCsv(text);
  const [leu, casa, intimate] = records;

  it("normalizes identity, region and budget", () => {
    expect(leu.slug).toBe("leu-gardens");
    expect(leu.region).toBe("orlando");
    expect(leu.budget_buckets).toEqual(["under-2k", "under-5k"]);
    expect(casa.budget_buckets).toEqual(["under-5k"]);
    expect(leu.capacity_max).toBe(180);
    expect(casa.capacity_max).toBe(120);
    expect(warnings).toEqual([]);
  });

  it("derives style flags from the style text", () => {
    expect(leu.garden_flag).toBe(true);
    expect(leu.historic_flag).toBe(true);
    expect(casa.european_flag).toBe(true);
    expect(leu.primary_vibe).toBe("Garden Romance / Classic Elegance");
  });

  it("splits ceremony and reception settings, treating conditional yes as partial", () => {
    expect(leu.indoor_ceremony).toBe("no");
    expect(leu.outdoor_ceremony).toBe("yes");
    expect(leu.indoor_reception).toBe("yes");
    expect(leu.outdoor_reception).toBe("no");
    expect(leu.indoor_support).toBe("yes");
    expect(leu.outdoor_support).toBe("yes");
    expect(casa.indoor_reception).toBe("partial");
    expect(casa.indoor_reception_max_guests).toBe(70);
    expect(intimate.indoor_reception_max_guests).toBe(60);
    expect(leu.indoor_reception_max_guests).toBeNull();
  });

  it("only passes real URLs through", () => {
    expect(leu.review_url).toBe("https://example.com/review");
    expect(leu.hero_image_url).toBe("https://example.com/hero.jpg");
    expect(casa.review_url).toBeNull();
    expect(casa.hero_image_url).toBeNull();
  });

  it("reads copy, vendor and micro-wedding columns", () => {
    expect(leu.top_match_description).toBe("Top copy");
    expect(leu.runners_up_description).toBe("Runner copy");
    expect(leu.micro_wedding_fit).toBe(true);
    expect(leu.outside_vendors).toBe("No");
    expect(leu.catering).toBe("must use caterer");
    expect(leu.source_type_tags).toEqual(["Garden", "Historic"]);
  });
});

describe("parseVenueCsv (edge cases)", () => {
  it("skips unnamed rows with a warning", () => {
    const { records, warnings } = parseVenueCsv(csv("Venue Name,Under $2k?,Under $5k?,Max. Guest Capacity", ",Yes,Yes,100"));
    expect(records).toEqual([]);
    expect(warnings[0].message).toMatch(/missing Venue Name/);
  });

  it("flags venues with unusable budget or capacity as launch-ineligible", () => {
    const { records, warnings } = parseVenueCsv(
      csv("Venue Name,Under $2k?,Under $5k?,Max. Guest Capacity", "Mystery Hall,,Unclear,TBD", "Fine Hall,No,Yes,100")
    );
    expect(records[0].launch_eligible).toBe(false);
    expect(records[0].launch_ineligibility_reason).toMatch(/Under \$2k\?.*Max\. Guest Capacity/);
    expect(records[1].launch_eligible).toBe(true);
    expect(records[1].launch_ineligibility_reason).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].venueName).toBe("Mystery Hall");
  });

  it("falls back to the legacy Indoor/Outdoor columns and older header names", () => {
    const { records } = parseVenueCsv(
      csv(
        "Venue Name,Under $2k?,Under $5k?,Max. Guest Capacity,Indoor,Outdoor,Catering,Outside Vendors,Author Made Venue Review",
        "Old Sheet Venue,No,Yes,90,Yes,Limited,Included,Yes,https://example.com/r"
      )
    );
    const [venue] = records;
    expect(venue.indoor_support).toBe("yes");
    expect(venue.outdoor_support).toBe("partial");
    expect(venue.indoor_ceremony).toBe("yes");
    expect(venue.outdoor_ceremony).toBe("partial");
    expect(venue.catering).toBe("Included");
    expect(venue.outside_vendors).toBe("Yes");
    expect(venue.review_url).toBe("https://example.com/r");
  });

  it("treats a conditional reception without a number or 'intimate' as unlimited-unknown", () => {
    const { records } = parseVenueCsv(
      csv(NEW_HEADERS, "Odd Venue,Orlando,No,Yes,100,Yes,Yes,Yes (weekdays only),No,Garden Romance,No,,,,,,,")
    );
    expect(records[0].indoor_reception).toBe("partial");
    expect(records[0].indoor_reception_max_guests).toBeNull();
  });

  it("reports unknown for settings columns that are blank", () => {
    const { records } = parseVenueCsv(csv(NEW_HEADERS, "Blank Venue,Orlando,No,Yes,100,,,,,Garden Romance,No,,,,,,,"));
    expect(records[0].indoor_support).toBe("unknown");
    expect(records[0].outdoor_support).toBe("unknown");
  });

  it("marks a place as no when every matching column says no", () => {
    const { records } = parseVenueCsv(csv(NEW_HEADERS, "No Indoor,Orlando,No,Yes,100,No,Yes,No,Yes,Garden Romance,No,,,,,,,"));
    expect(records[0].indoor_support).toBe("no");
    expect(records[0].outdoor_support).toBe("yes");
  });
});

describe("committed venue data (data/venues.csv)", () => {
  const { records } = parseVenueCsv(readFileSync(join(process.cwd(), "data", "venues.csv"), "utf8"));
  const eligible = records.filter((venue) => venue.launch_eligible);

  it("loads a healthy number of launch-eligible venues", () => {
    expect(records.length).toBeGreaterThan(10);
    expect(eligible.length).toBeGreaterThan(10);
  });

  it("gives every venue a unique slug", () => {
    const slugs = records.map((venue) => venue.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // The Kit welcome automations trigger on the style tag, so a launch-ready venue whose first style
  // is not one of the five exact names would silently skip the welcome sequence.
  it("every launch-eligible venue's first style maps to one of the five Kit style tags", () => {
    const bad = eligible.filter((venue) => topStyleForVenue(venue.primary_vibe) === null).map((venue) => `${venue.name}: ${venue.primary_vibe}`);
    expect(bad).toEqual([]);
    expect(STYLE_TAG_NAMES).toHaveLength(5);
  });
});
