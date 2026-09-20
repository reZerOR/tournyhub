-- Authoritative live Auction state: Player Presentations, Bid Attempts,
-- Sales, the Unsold Pool, immutable Audit Entries, the revision outbox, and
-- the command idempotency ledger. PostgreSQL stays the only source of truth;
-- Realtime only distributes committed revisions.

create table "player_presentation" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "player_entry_id" uuid not null
    references "player_entry" ("id") on delete cascade,
  "tier_id" uuid references "tier" ("id") on delete set null,
  "starting_price" integer not null,
  "selection_method" text not null,
  "state" text not null default 'open',
  "close_mode" text not null,
  "opened_at" timestamptz not null default now(),
  "warning_deadline" timestamptz,
  "close_deadline" timestamptz,
  "closed_at" timestamptz,
  "return_reason" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "player_presentation_starting_price_check" check (
    "starting_price" between 1 and 1000000
  ),
  constraint "player_presentation_selection_method_check" check (
    "selection_method" in ('manual', 'random')
  ),
  constraint "player_presentation_state_check" check (
    "state" in ('open', 'closing', 'sold', 'unsold', 'returned')
  ),
  constraint "player_presentation_close_mode_check" check (
    "close_mode" in ('manual', 'timed')
  ),
  constraint "player_presentation_return_reason_check" check (
    "state" <> 'returned'
    or ("return_reason" is not null and char_length("return_reason") between 1 and 200)
  ),
  constraint "player_presentation_returned_closed_check" check (
    "state" <> 'returned' or "closed_at" is not null
  )
);

-- Only one Player Presentation is Active in an Auction at a time.
create unique index "player_presentation_active_key"
  on "player_presentation" ("auction_id")
  where "state" in ('open', 'closing');

-- A Player can be Sold at most once. Returned and Unsold Presentations may be
-- followed by another Presentation when the Player is offered again.
create unique index "player_presentation_pending_or_sold_key"
  on "player_presentation" ("player_entry_id")
  where "state" in ('open', 'closing', 'sold');

create index "player_presentation_auction_id_idx"
  on "player_presentation" ("auction_id");

create table "sale" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "presentation_id" uuid not null unique
    references "player_presentation" ("id") on delete cascade,
  "player_entry_id" uuid not null
    references "player_entry" ("id") on delete cascade,
  "team_id" uuid not null references "team" ("id") on delete cascade,
  "amount" integer not null,
  "source" text not null,
  "reversed_at" timestamptz,
  "reversed_reason" text,
  "created_at" timestamptz not null default now(),
  constraint "sale_amount_check" check ("amount" >= 0),
  constraint "sale_source_check" check ("source" in ('bid', 'forced'))
);

-- A Player is Sold at most once while the Sale is not reversed.
create unique index "sale_player_entry_key"
  on "sale" ("player_entry_id")
  where "reversed_at" is null;

create index "sale_auction_id_team_id_idx" on "sale" ("auction_id", "team_id");

create table "unsold_membership" (
  "player_entry_id" uuid not null primary key
    references "player_entry" ("id") on delete cascade,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "tier_id" uuid references "tier" ("id") on delete set null,
  "presentation_id" uuid not null
    references "player_presentation" ("id") on delete cascade,
  "created_at" timestamptz not null default now()
);

create index "unsold_membership_auction_id_idx"
  on "unsold_membership" ("auction_id");

create table "bid_attempt" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "presentation_id" uuid not null
    references "player_presentation" ("id") on delete cascade,
  "team_id" uuid not null references "team" ("id") on delete cascade,
  "actor_user_id" text references "user" ("id") on delete set null,
  "command_id" text not null,
  "amount" integer not null,
  "status" text not null,
  "reason" text,
  "server_time" timestamptz not null default now(),
  "created_at" timestamptz not null default now(),
  constraint "bid_attempt_amount_check" check ("amount" >= 0),
  constraint "bid_attempt_status_check" check ("status" in ('accepted', 'rejected')),
  constraint "bid_attempt_reason_check" check (
    ("status" = 'accepted' and "reason" is null)
    or ("status" = 'rejected' and "reason" is not null)
  )
);

-- The first valid simultaneous transaction for one price wins. Every losing
-- attempt receives a stable rejection, so an accepted price is unique.
create unique index "bid_attempt_accepted_price_key"
  on "bid_attempt" ("presentation_id", "amount")
  where "status" = 'accepted';

create unique index "bid_attempt_command_key"
  on "bid_attempt" ("auction_id", "command_id");

create index "bid_attempt_auction_id_idx" on "bid_attempt" ("auction_id");

create table "audit_entry" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "actor_user_id" text references "user" ("id") on delete set null,
  "action" text not null,
  "reason" text,
  "details" jsonb not null default '{}'::jsonb,
  "server_time" timestamptz not null default now(),
  constraint "audit_entry_action_check" check (
    char_length("action") between 1 and 60
  )
);

create index "audit_entry_auction_id_server_time_idx"
  on "audit_entry" ("auction_id", "server_time");

-- One row per committed shared state change. Realtime distribution reads this
-- outbox; the browser never authorizes itself from it.
create table "auction_outbox_event" (
  "id" bigint generated always as identity primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "revision" integer not null,
  "kind" text not null,
  "payload" jsonb not null default '{}'::jsonb,
  "created_at" timestamptz not null default now(),
  "published_at" timestamptz,
  constraint "auction_outbox_event_revision_check" check ("revision" >= 1)
);

create index "auction_outbox_event_auction_id_revision_idx"
  on "auction_outbox_event" ("auction_id", "revision");

create index "auction_outbox_event_unpublished_idx"
  on "auction_outbox_event" ("auction_id")
  where "published_at" is null;

-- Idempotency ledger for every live command. A duplicate command ID returns the
-- originally stored result without a second Bid, revision, or outbox event.
create table "auction_command" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "command_id" text not null,
  "actor_user_id" text references "user" ("id") on delete set null,
  "kind" text not null,
  "result" jsonb not null,
  "created_at" timestamptz not null default now(),
  constraint "auction_command_command_id_check" check (
    char_length("command_id") between 8 and 100
  ),
  unique ("auction_id", "command_id")
);

create index "auction_command_auction_id_idx" on "auction_command" ("auction_id");
