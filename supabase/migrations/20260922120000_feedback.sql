-- Authenticated beta feedback. A report records the page the User was on, the
-- User, a category, the message, and the server timestamp. There is no column
-- for an Auction, a Team, a snapshot, or a credential, so protected Auction
-- data cannot be attached to a report.

create table "feedback" (
  "id" uuid not null default gen_random_uuid() primary key,
  "user_id" text not null references "user" ("id") on delete cascade,
  "page" text not null,
  "category" text not null,
  "message" text not null,
  "created_at" timestamptz not null default now(),
  constraint "feedback_page_check" check (
    char_length("page") between 1 and 200
  ),
  constraint "feedback_category_check" check (
    "category" in ('bug', 'confusing', 'missing', 'performance', 'other')
  ),
  constraint "feedback_message_check" check (
    char_length("message") between 10 and 2000
  )
);

-- The submission rate limit counts one User's recent reports.
create index "feedback_user_id_created_at_idx"
  on "feedback" ("user_id", "created_at" desc);

create index "feedback_created_at_idx" on "feedback" ("created_at" desc);
