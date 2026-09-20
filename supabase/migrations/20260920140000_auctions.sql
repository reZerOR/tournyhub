create table "auction" (
  "id" uuid not null default gen_random_uuid() primary key,
  "organizer_id" text not null references "user" ("id") on delete cascade,
  "title" text not null,
  "game" text not null,
  "rules_mode" text not null
    constraint "auction_rules_mode_check" check ("rules_mode" in ('simple', 'tiered')),
  "close_mode" text not null
    constraint "auction_close_mode_check" check ("close_mode" in ('manual', 'timed')),
  "status" text not null default 'draft'
    constraint "auction_status_check" check (
      "status" in ('draft', 'ready', 'live', 'paused', 'completed', 'cancelled', 'archived')
    ),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create index "auction_organizer_id_status_idx" on "auction" ("organizer_id", "status");
