-- Wedding venue quiz schema. Run this once in the Supabase SQL editor for a new project.
create extension if not exists pgcrypto;

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  city_area text,
  region text, -- derived from city_area at import time: winter-park | orlando | north | east | south | unknown
  budget_label text, -- raw "Price / Budget Fit" text from the source sheet
  budget_buckets text[] not null default '{}', -- subset of {under-2k, under-5k}; empty when budget is unclear/over-5k only
  capacity_max integer,
  indoor_support text, -- yes | partial | no | unknown
  outdoor_support text, -- yes | partial | no | unknown
  primary_vibe text, -- raw "Primary Style / Vibe" text
  micro_wedding_fit boolean not null default false,
  garden_flag boolean not null default false,
  historic_flag boolean not null default false,
  european_flag boolean not null default false,
  source_type_tags text[] not null default '{}',
  source_url text,
  starting_price_numeric numeric,
  price_notes text,
  ceremony_reception text, -- yes | no | unknown
  reception_only text, -- yes | no | unknown
  weather_backup text, -- yes | partial | no | unknown
  getting_ready text, -- yes | no | unknown
  overnight_accommodation text, -- yes | no | unknown
  catering text,
  outside_vendors text,
  photo_notes text,
  best_for text,
  not_ideal_for text,
  review_url text,
  last_verified text,
  verification_needed boolean not null default false,
  pricing_data_date text,
  research_status text,
  launch_eligible boolean not null default false,
  launch_ineligibility_reason text,
  hero_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  consent boolean not null,
  answers_json jsonb not null,
  matched_venue_ids jsonb not null default '[]',
  top_venue_id text,
  kit_tags_json jsonb not null default '[]',
  hard_filter_status text, -- exact | narrow | closest
  result_mode text
);

create table if not exists tag_mappings (
  id uuid primary key default gen_random_uuid(),
  source_column text not null,
  source_value text not null,
  normalized_tag text not null,
  enabled boolean not null default true,
  unique (source_column, source_value)
);

create index if not exists venues_launch_eligible_idx on venues (launch_eligible);
create index if not exists venues_region_idx on venues (region);
create index if not exists quiz_submissions_created_at_idx on quiz_submissions (created_at desc);
