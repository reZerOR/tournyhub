-- Timed Close durations, Paused Auctions, Unsold Rounds, Forced Assignment,
-- Final Unsold, and correction records. PostgreSQL stays the only source of
-- truth: every deadline is derived from database time, and every correction
-- is a compensating record instead of a deletion.

-- The Timed Close countdown length in whole seconds. Every Player in a Timed
-- Close Auction uses the same duration, defaulting to 30 seconds.
alter table "auction_rule_set"
  add column "timed_close_seconds" integer not null default 30,
  add constraint "auction_rule_set_timed_close_seconds_check" check (
    "timed_close_seconds" between 1 and 3600
  );

-- A Paused Auction preserves the Active Player and the leading Bid, so the
-- remaining closing duration is parked here until the Organizer resumes.
-- `paused_state` holds the state to restore on resume ('closing' rebuilds the
-- Manual Close warning, 'open' rebuilds a Timed Close deadline or reopens the
-- Presentation), not the state the Presentation has while paused.
alter table "player_presentation"
  add column "paused_state" text,
  add column "paused_remaining_ms" integer,
  add constraint "player_presentation_paused_state_check" check (
    "paused_state" is null or "paused_state" in ('open', 'closing')
  ),
  add constraint "player_presentation_paused_remaining_check" check (
    "paused_remaining_ms" is null or "paused_remaining_ms" >= 0
  );

-- A Forced Assignment creates its Presentation without a Bid, so the selection
-- method records that the system assigned it.
alter table "player_presentation"
  drop constraint "player_presentation_selection_method_check";

alter table "player_presentation"
  add constraint "player_presentation_selection_method_check" check (
    "selection_method" in ('manual', 'random', 'forced')
  );

-- An Unsold Round reoffers resolved unsold Players. Only one round is open at
-- a time, and every round keeps its own presentation history.
create table "unsold_round" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "sequence" integer not null,
  "status" text not null default 'open',
  "opened_at" timestamptz not null default now(),
  "closed_at" timestamptz,
  constraint "unsold_round_sequence_check" check ("sequence" >= 1),
  constraint "unsold_round_status_check" check (
    "status" in ('open', 'closed')
  ),
  constraint "unsold_round_closed_check" check (
    "status" <> 'closed' or "closed_at" is not null
  )
);

create unique index "unsold_round_auction_id_sequence_key"
  on "unsold_round" ("auction_id", "sequence");

create unique index "unsold_round_open_key"
  on "unsold_round" ("auction_id")
  where "status" = 'open';

create index "unsold_round_auction_id_idx" on "unsold_round" ("auction_id");

alter table "player_presentation"
  add column "unsold_round_id" uuid
    references "unsold_round" ("id") on delete set null;

create index "player_presentation_unsold_round_id_idx"
  on "player_presentation" ("unsold_round_id");

-- An Unsold Pool membership ends when the Player is assigned (by Forced
-- Assignment) or marked Final Unsold. A reversed Sale returns the Player by
-- clearing the resolution again, so the row stays as history.
alter table "unsold_membership"
  add column "resolved_at" timestamptz,
  add column "resolution" text,
  add column "sale_id" uuid references "sale" ("id") on delete set null,
  add constraint "unsold_membership_resolution_check" check (
    "resolution" is null or "resolution" in ('assigned', 'final_unsold')
  ),
  add constraint "unsold_membership_resolved_check" check (
    ("resolved_at" is null and "resolution" is null)
    or ("resolved_at" is not null and "resolution" is not null)
  );

create index "unsold_membership_unresolved_idx"
  on "unsold_membership" ("auction_id")
  where "resolved_at" is null;

-- A reversed Sale keeps its original row and gains a compensating record.
alter table "sale"
  add column "reversed_by_user_id" text references "user" ("id") on delete set null;

create table "sale_reversal" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "sale_id" uuid not null unique references "sale" ("id") on delete cascade,
  "player_entry_id" uuid not null
    references "player_entry" ("id") on delete cascade,
  "team_id" uuid not null references "team" ("id") on delete cascade,
  "amount" integer not null,
  "reason" text not null,
  "actor_user_id" text references "user" ("id") on delete set null,
  "created_at" timestamptz not null default now(),
  constraint "sale_reversal_amount_check" check ("amount" >= 0),
  constraint "sale_reversal_reason_check" check (
    char_length("reason") between 1 and 200
  )
);

create index "sale_reversal_auction_id_idx" on "sale_reversal" ("auction_id");

-- A cancelled Bid keeps its amount, Team, and server time; only its status and
-- the cancellation reason change. The accepted-price index no longer sees it,
-- so the preceding valid Bid becomes the leader again. Deleting the
-- responsible User clears `cancelled_by_user_id`, but `cancelled_at` always
-- proves the cancellation happened.
alter table "bid_attempt"
  drop constraint "bid_attempt_status_check",
  drop constraint "bid_attempt_reason_check";

alter table "bid_attempt"
  add column "cancelled_at" timestamptz,
  add column "cancelled_by_user_id" text
    references "user" ("id") on delete set null,
  add constraint "bid_attempt_status_check" check (
    "status" in ('accepted', 'rejected', 'cancelled')
  ),
  add constraint "bid_attempt_reason_check" check (
    ("status" = 'accepted' and "reason" is null)
    or ("status" in ('rejected', 'cancelled') and "reason" is not null)
  ),
  add constraint "bid_attempt_cancelled_check" check (
    ("status" = 'cancelled' and "cancelled_at" is not null)
    or (
      "status" <> 'cancelled'
      and "cancelled_at" is null
      and "cancelled_by_user_id" is null
    )
  );

-- A completed Auction publishes one final authoritative Results revision.
alter table "auction" add column "completed_at" timestamptz;

create index "unsold_membership_auction_id_resolution_idx"
  on "unsold_membership" ("auction_id", "resolution");
