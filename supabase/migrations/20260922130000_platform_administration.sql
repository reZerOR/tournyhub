-- Platform Administration. A small allowlisted group may suspend Users, revoke
-- their sessions, hide Auctions, and inspect protected Auction data with a
-- recorded reason. Administrator power never reaches Auction content: there is
-- no column or command here that edits Rules, Teams, Bids, Sales, or Results.

create table "platform_administrator" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "note" text,
  "created_at" timestamptz not null default now()
);

create table "user_suspension" (
  "id" uuid not null default gen_random_uuid() primary key,
  "user_id" text not null references "user" ("id") on delete cascade,
  "reason" text not null,
  "suspended_by_user_id" text references "user" ("id") on delete set null,
  "suspended_at" timestamptz not null default now(),
  "restored_at" timestamptz,
  "restored_by_user_id" text references "user" ("id") on delete set null,
  constraint "user_suspension_reason_check" check (
    char_length("reason") between 1 and 200
  ),
  -- A recorded restorer always implies a restore time. The reverse is not
  -- required: deleting the administrator who lifted the suspension clears
  -- `restored_by_user_id`, and `restored_at` still proves the restore happened.
  constraint "user_suspension_restored_check" check (
    "restored_by_user_id" is null or "restored_at" is not null
  )
);

-- A User has at most one active suspension; the history of earlier ones stays.
create unique index "user_suspension_active_key"
  on "user_suspension" ("user_id")
  where "restored_at" is null;

create index "user_suspension_user_id_idx" on "user_suspension" ("user_id");

-- Every administrator action is attributed and reasoned. `auction_id` is
-- nullable because suspending a User is a platform action, not an Auction one.
create table "moderation_access_entry" (
  "id" bigint not null generated always as identity,
  "actor_user_id" text references "user" ("id") on delete set null,
  "auction_id" uuid references "auction" ("id") on delete cascade,
  "action" text not null,
  "reason" text not null,
  "server_time" timestamptz not null default now(),
  primary key ("id"),
  constraint "moderation_access_action_check" check (
    "action" in (
      'inspect_auction',
      'suspend_user',
      'restore_user',
      'revoke_sessions',
      'hide_auction',
      'unhide_auction',
      'bootstrap_administrator'
    )
  ),
  constraint "moderation_access_reason_check" check (
    char_length("reason") between 1 and 200
  )
);

create index "moderation_access_auction_id_idx"
  on "moderation_access_entry" ("auction_id");

create index "moderation_access_actor_idx"
  on "moderation_access_entry" ("actor_user_id", "server_time" desc);

-- A hidden Auction keeps every domain record and is simply unavailable to
-- Participants and unrelated Users until it is unhidden.
alter table "auction"
  add column "hidden_at" timestamptz,
  add column "hidden_by_user_id" text references "user" ("id") on delete set null,
  add column "hidden_reason" text;

alter table "auction"
  add constraint "auction_hidden_check" check (
    (
      "hidden_at" is not null
      and "hidden_reason" is not null
      and char_length("hidden_reason") between 1 and 200
    )
    or (
      "hidden_at" is null
      and "hidden_reason" is null
      and "hidden_by_user_id" is null
    )
  );

create index "auction_hidden_idx" on "auction" ("hidden_at")
  where "hidden_at" is not null;
