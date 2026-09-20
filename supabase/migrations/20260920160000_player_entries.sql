create table "player_entry" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "display_name" text not null,
  "role" text,
  "external_player_id" text,
  "phone_number" text,
  "starting_price_override" integer,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "player_entry_display_name_check" check (
    char_length("display_name") between 1 and 100
  ),
  constraint "player_entry_role_check" check (
    "role" is null or (char_length("role") between 1 and 60)
  ),
  constraint "player_entry_external_player_id_check" check (
    "external_player_id" is null
    or (char_length("external_player_id") between 1 and 100)
  ),
  constraint "player_entry_phone_number_check" check (
    "phone_number" is null or (char_length("phone_number") between 1 and 40)
  ),
  constraint "player_entry_starting_price_override_check" check (
    "starting_price_override" is null
    or ("starting_price_override" between 1 and 1000000)
  )
);

create index "player_entry_auction_id_idx" on "player_entry" ("auction_id");

create unique index "player_entry_auction_id_external_player_id_key"
  on "player_entry" ("auction_id", "external_player_id")
  where "external_player_id" is not null;

create table "custom_player_field" (
  "id" uuid not null default gen_random_uuid() primary key,
  "auction_id" uuid not null references "auction" ("id") on delete cascade,
  "label" text not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "custom_player_field_label_check" check (
    char_length("label") between 1 and 60
  )
);

create index "custom_player_field_auction_id_idx"
  on "custom_player_field" ("auction_id");

create table "player_entry_custom_value" (
  "player_entry_id" uuid not null
    references "player_entry" ("id") on delete cascade,
  "custom_player_field_id" uuid not null
    references "custom_player_field" ("id") on delete cascade,
  "value" text not null,
  primary key ("player_entry_id", "custom_player_field_id"),
  constraint "player_entry_custom_value_value_check" check (
    char_length("value") between 1 and 200
  )
);

create index "player_entry_custom_value_field_idx"
  on "player_entry_custom_value" ("custom_player_field_id");
