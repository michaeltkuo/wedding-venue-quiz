import type { VenueRow } from "./types";

// Hand-written subset of a Supabase generated types file, matching supabase/schema.sql.
// Regenerate with `supabase gen types typescript` later if the schema grows.
// Everything here must stay a `type` alias, not an `interface`: Supabase's GenericTable/
// GenericSchema constraint check silently resolves interface-based shapes to `never`.

export type VenuesInsert = Omit<VenueRow, "id"> & {
  id?: string;
};

export type QuizSubmissionFields = {
  id?: string;
  created_at?: string;
  email: string;
  consent: boolean;
  answers_json: unknown;
  matched_venue_ids?: unknown;
  top_venue_id?: string | null;
  kit_tags_json?: unknown;
  hard_filter_status?: string | null;
  result_mode?: string | null;
};

export type Database = {
  public: {
    Tables: {
      venues: {
        Row: VenueRow;
        Insert: VenuesInsert;
        Update: Partial<VenuesInsert>;
        Relationships: [];
      };
      quiz_submissions: {
        Row: QuizSubmissionFields & { id: string; created_at: string };
        Insert: QuizSubmissionFields;
        Update: Partial<QuizSubmissionFields>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};
