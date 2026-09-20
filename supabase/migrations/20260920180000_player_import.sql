create table "player_import" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "command_id" uuid not null,
  "imported_count" integer not null,
  "warning_count" integer not null default 0,
  "created_at" timestamptz not null default now(),
  constraint "player_import_imported_count_check" check ("imported_count" >= 0),
  constraint "player_import_warning_count_check" check ("warning_count" >= 0)
);

create index "player_import_auction_id_idx" on "player_import" ("auction_id");

create unique index "player_import_auction_id_command_id_key"
  on "player_import" ("auction_id", "command_id");
