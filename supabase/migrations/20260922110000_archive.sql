-- Auction archival. An Archived Auction leaves the normal lists, keeps its
-- records intact, and is permanently deleted once its seven-day recovery
-- window closes. Restore returns it to the state it was archived from.

alter table "auction"
  add column "archived_at" timestamptz,
  add column "archived_previous_status" text,
  add column "archive_deadline" timestamptz;

-- An Archived Auction always records when it was archived, where it came from,
-- and when it may be deleted. Every other state carries none of these.
alter table "auction"
  add constraint "auction_archived_check" check (
    (
      "status" = 'archived'
      and "archived_at" is not null
      and "archive_deadline" is not null
      and "archived_previous_status" in ('draft', 'ready', 'completed', 'cancelled')
    )
    or (
      "status" <> 'archived'
      and "archived_at" is null
      and "archive_deadline" is null
      and "archived_previous_status" is null
    )
  );

-- A Live or Paused Auction is never archived, so the recorded previous state is
-- always one an Auction may be archived from; the check above enforces it.
comment on column "auction"."archived_previous_status" is
  'The non-live state Restore returns the Auction to.';

-- Permanent deletion scans only archived rows whose deadline has passed.
create index "auction_archive_deadline_idx"
  on "auction" ("archive_deadline")
  where "status" = 'archived';
