// Shared types for the venue matching API. Mirrors supabase/schema.sql's `venues` table shape.

export type TriState = "yes" | "partial" | "no" | "unknown";

// Must stay a `type` alias, not an `interface`: Supabase's GenericTable/GenericSchema constraint
// check silently resolves interface-based Row/Insert types to `never`.
export type VenueRow = {
  id: string;
  slug: string;
  name: string;
  city_area: string | null;
  region: string | null;
  budget_label: string | null;
  budget_buckets: string[];
  capacity_max: number | null;
  indoor_support: TriState | null;
  outdoor_support: TriState | null;
  // Separate ceremony/reception columns from the 10.26.2026 sheet. "partial" on indoor_reception means
  // the sheet limits the indoor space to a guest count (see indoor_reception_max_guests).
  indoor_ceremony: TriState | null;
  outdoor_ceremony: TriState | null;
  indoor_reception: TriState | null;
  outdoor_reception: TriState | null;
  indoor_reception_max_guests: number | null;
  primary_vibe: string | null;
  micro_wedding_fit: boolean;
  garden_flag: boolean;
  historic_flag: boolean;
  european_flag: boolean;
  source_type_tags: string[];
  source_url: string | null;
  starting_price_numeric: number | null;
  price_notes: string | null;
  ceremony_reception: TriState | null;
  reception_only: TriState | null;
  weather_backup: TriState | null;
  getting_ready: TriState | null;
  overnight_accommodation: TriState | null;
  catering: string | null;
  outside_vendors: string | null;
  photo_notes: string | null;
  best_for: string | null;
  not_ideal_for: string | null;
  review_url: string | null;
  last_verified: string | null;
  verification_needed: boolean;
  pricing_data_date: string | null;
  research_status: string | null;
  launch_eligible: boolean;
  launch_ineligibility_reason: string | null;
  hero_image_url: string | null;
};

// Matches the quiz question ids in embed-app.html; keep both in sync if questions change.
export interface QuizAnswers {
  vibe?: string;
  guestCount?: string;
  guestMinimum?: number;
  budget?: string;
  format?: string;
  setting?: string;
  location?: string;
  // Q7 dealbreakers (multi-select): outsideCaterer, outdoorOnlyCeremony, longDrive, noAirConditionedReception, none.
  dealbreakers?: string[];
  perks?: string[];
  planning?: string;
  priority?: string;
}

export interface MatchRequestBody {
  email: string;
  consent: boolean;
  answers: QuizAnswers;
}

export interface RankedVenue extends VenueRow {
  score: number;
}
