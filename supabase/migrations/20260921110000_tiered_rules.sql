-- Tiered Rules: ordered Auction-local Tiers with their own Starting Price and
-- shared per-Team minimum and maximum counts. Tiers are Auction-scoped so
-- every constraint can be enforced inside the same Auction lock as Rules.

create table "tier" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "label" text not null,
  "normalized_label" text not null,
  "position" integer not null default 0,
  "starting_price" integer not null,
  "min_per_team" integer not null default 0,
  "max_per_team" integer not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "tier_label_check" check (
    char_length("label") between 1 and 60
  ),
  constraint "tier_normalized_label_check" check (
    char_length("normalized_label") between 1 and 60
  ),
  constraint "tier_position_check" check ("position" >= 0),
  constraint "tier_starting_price_check" check (
    "starting_price" between 1 and 1000000
  ),
  constraint "tier_min_per_team_check" check ("min_per_team" >= 0),
  constraint "tier_max_per_team_check" check ("max_per_team" >= 1),
  constraint "tier_range_check" check ("min_per_team" <= "max_per_team")
);

-- Tier order is unique within an Auction. Reordering shifts positions through a
-- temporary offset inside one transaction so the constraint never observes a
-- duplicate.
create unique index "tier_auction_id_position_key"
  on "tier" ("auction_id", "position");

create unique index "tier_auction_id_normalized_label_key"
  on "tier" ("auction_id", "normalized_label");

create index "tier_auction_id_idx" on "tier" ("auction_id");

-- Every biddable Player belongs to exactly one Tier before a Tiered Auction is
-- Ready. Removing a Tier clears the assignment, which Readiness then reports.
alter table "player_entry"
  add column "tier_id" uuid references "tier" ("id") on delete set null;

create index "player_entry_tier_id_idx" on "player_entry" ("tier_id");

-- The Tier currently offered. Only one Tier is active at a time.
alter table "auction"
  add column "active_tier_id" uuid references "tier" ("id") on delete set null;
