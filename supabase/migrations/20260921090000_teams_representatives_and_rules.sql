-- Teams, Player Representatives, Outside Representative invitations, Simple
-- Rules, and the first immutable Auction revision. Teams and their
-- representatives are Auction-scoped so every constraint can be enforced
-- inside one lock on the Auction row.

create table "team" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "name" text,
  "normalized_name" text,
  "color" text,
  "logo_storage_key" text,
  "representative_user_id" text references "user" ("id") on delete set null,
  "representative_type" text,
  "position" integer not null default 0,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "team_name_check" check (
    "name" is null or (char_length("name") between 1 and 100)
  ),
  constraint "team_normalized_name_check" check (
    "normalized_name" is null
    or (char_length("normalized_name") between 1 and 100)
  ),
  constraint "team_color_check" check (
    "color" is null or "color" ~ '^#[0-9a-f]{6}$'
  ),
  constraint "team_logo_storage_key_check" check (
    "logo_storage_key" is null
    or (char_length("logo_storage_key") between 1 and 200)
  ),
  constraint "team_representative_type_check" check (
    "representative_type" is null
    or "representative_type" in ('player', 'outside')
  ),
  constraint "team_representative_consistency_check" check (
    ("representative_user_id" is null and "representative_type" is null)
    or ("representative_user_id" is not null and "representative_type" is not null)
  )
);

-- Deleting a User clears team.representative_user_id through ON DELETE SET
-- NULL. This trigger clears the matching type in the same statement so the
-- consistency check above stays strict.
create function "clear_team_representative_type"()
returns trigger
language plpgsql
as $$
begin
  if new."representative_user_id" is null then
    new."representative_type" = null;
  end if;
  return new;
end;
$$;

create trigger "team_clear_representative_type"
  before insert or update on "team"
  for each row execute function "clear_team_representative_type"();

create index "team_auction_id_idx" on "team" ("auction_id");

create index "team_auction_id_position_idx" on "team" ("auction_id", "position");

-- Team names are unique within an Auction after normalization. Calculated
-- Teams may stay unnamed until the Organizer names them.
create unique index "team_auction_id_normalized_name_key"
  on "team" ("auction_id", "normalized_name")
  where "normalized_name" is not null;

-- One User represents at most one Team in an Auction.
create unique index "team_auction_id_representative_user_id_key"
  on "team" ("auction_id", "representative_user_id")
  where "representative_user_id" is not null;

alter table "player_entry"
  add column "team_id" uuid references "team" ("id") on delete set null,
  add column "is_representative" boolean not null default false;

alter table "player_entry"
  add constraint "player_entry_representative_team_check" check (
    not "is_representative" or "team_id" is not null
  );

create index "player_entry_team_id_idx" on "player_entry" ("team_id");

-- A Team has at most one Player Representative and a Player Entry belongs to
-- at most one Team.
create unique index "player_entry_team_id_representative_key"
  on "player_entry" ("team_id")
  where "is_representative" and "team_id" is not null;

create table "team_invitation" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "team_id" uuid not null references "team" ("id") on delete cascade,
  "invited_email" text not null,
  "token_digest" text not null unique,
  "status" text not null default 'pending',
  "expires_at" timestamptz not null,
  "accepted_at" timestamptz,
  "accepted_by_user_id" text references "user" ("id") on delete set null,
  "superseded_by_id" uuid references "team_invitation" ("id") on delete set null,
  "created_at" timestamptz not null default now(),
  constraint "team_invitation_status_check" check (
    "status" in ('pending', 'accepted', 'superseded', 'revoked')
  ),
  constraint "team_invitation_invited_email_check" check (
    char_length("invited_email") between 3 and 320
  ),
  -- An accepted invitation keeps its acceptance time even if the accepting
  -- User is later deleted, which clears accepted_by_user_id.
  constraint "team_invitation_accepted_check" check (
    "status" <> 'accepted' or "accepted_at" is not null
  )
);

create index "team_invitation_auction_id_idx"
  on "team_invitation" ("auction_id");

create index "team_invitation_email_status_idx"
  on "team_invitation" ("invited_email", "status");

-- Issuing a newer invitation for a Team supersedes every older pending one.
create unique index "team_invitation_team_id_pending_key"
  on "team_invitation" ("team_id")
  where "status" = 'pending';

create table "auction_rule_set" (
  "auction_id" uuid not null primary key
    references "auction" ("id") on delete cascade,
  "roster_min" integer,
  "roster_max" integer,
  "budget" integer,
  "bid_increment" integer,
  "default_starting_price" integer,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "auction_rule_set_roster_min_check" check (
    "roster_min" is null or "roster_min" >= 1
  ),
  constraint "auction_rule_set_roster_max_check" check (
    "roster_max" is null or "roster_max" >= 1
  ),
  constraint "auction_rule_set_budget_check" check (
    "budget" is null or "budget" >= 1
  ),
  constraint "auction_rule_set_bid_increment_check" check (
    "bid_increment" is null or "bid_increment" >= 1
  ),
  constraint "auction_rule_set_default_starting_price_check" check (
    "default_starting_price" is null or "default_starting_price" >= 1
  ),
  constraint "auction_rule_set_roster_range_check" check (
    "roster_min" is null
    or "roster_max" is null
    or "roster_min" <= "roster_max"
  )
);

-- The Auction revision and its first immutable snapshot. Revision 1 records
-- the frozen Starting Prices at the moment the Organizer starts the Auction.
alter table "auction" add column "revision" integer not null default 0;

alter table "auction" add constraint "auction_revision_check" check (
  "revision" >= 0
);

-- The beta permits exactly one Live Auction across the whole service.
create unique index "auction_single_live_key"
  on "auction" ("status")
  where "status" = 'live';

create table "auction_revision" (
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "revision" integer not null,
  "payload" jsonb not null,
  "created_at" timestamptz not null default now(),
  primary key ("auction_id", "revision"),
  constraint "auction_revision_positive_check" check ("revision" >= 1)
);

-- Team logos are validated and re-encoded before they are stored under a
-- random key. Keeping the bytes in PostgreSQL keeps backups and restores in
-- one artifact until Supabase Storage is wired up.
create table "stored_object" (
  "key" text not null primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "content_type" text not null,
  "content" bytea not null,
  "byte_size" integer not null,
  "created_at" timestamptz not null default now(),
  constraint "stored_object_content_type_check" check (
    "content_type" in ('image/png')
  ),
  constraint "stored_object_byte_size_check" check ("byte_size" >= 1)
);

create index "stored_object_auction_id_idx" on "stored_object" ("auction_id");
