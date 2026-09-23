-- Add 'direct' as a valid sale source for Organizer-initiated Direct Sales.
-- A Direct Sale lets the Organizer assign a Player to a named Team at a custom
-- Credit amount while the Auction is Paused, bypassing the bidding process.

alter table "sale"
  drop constraint "sale_source_check";

alter table "sale"
  add constraint "sale_source_check"
    check ("source" in ('bid', 'forced', 'direct'));
