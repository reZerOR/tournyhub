-- Fix: allow Direct Sales (which have no player_presentation) to insert
-- into the sale table without a presentation_id, and allow unsold_membership
-- to be cleared by a Direct Sale without requiring a presentation reference.
--
-- sale.presentation_id: was NOT NULL UNIQUE, becomes nullable UNIQUE.
--   The UNIQUE constraint is kept so one Presentation still maps to at most
--   one Sale, but Direct Sales simply leave it NULL.
--
-- unsold_membership.presentation_id: was NOT NULL, becomes nullable.
--   A Direct Sale resolves an unsold membership that was never given a
--   fresh presentation, so the reference must be optional.

alter table "sale"
  alter column "presentation_id" drop not null;

alter table "unsold_membership"
  alter column "presentation_id" drop not null;
