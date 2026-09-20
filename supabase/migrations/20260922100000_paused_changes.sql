-- Controlled changes to a running Auction. Every controlled change is
-- compensating: accepted history is never rewritten, and each accepted change
-- records an immutable Audit Entry plus a participant announcement. A Live
-- Auction may only be changed while Paused, and cancellation is permanent.

alter table "auction"
  add column "cancelled_at" timestamptz,
  add column "cancelled_reason" text,
  add column "ownership_transferred_at" timestamptz;

-- A Cancelled Auction always records when and why it was cancelled. The
-- deadline columns stay nullable for the other lifecycle states.
alter table "auction"
  add constraint "auction_cancelled_check" check (
    ("cancelled_at" is null and "cancelled_reason" is null)
    or (
      "cancelled_at" is not null
      and char_length("cancelled_reason") between 1 and 200
    )
  );

alter table "auction"
  add constraint "auction_cancelled_status_check" check (
    "status" <> 'cancelled' or "cancelled_at" is not null
  );

-- A cancelled Auction is read-only: it can never return to a live state.
alter table "auction"
  add constraint "auction_cancelled_not_live_check" check (
    "status" not in ('live', 'paused') or "cancelled_at" is null
  );

comment on column "auction"."cancelled_reason" is
  'Organizer-supplied reason of at most 200 characters, kept immutable.';
