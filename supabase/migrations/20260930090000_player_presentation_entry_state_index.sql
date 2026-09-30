-- The eligible-Player, unsold-pool, tier-progress and Live Snapshot queries all
-- filter player_presentation by (player_entry_id, state), or by player_entry_id
-- alone in a LATERAL join. Neither is served by an existing index:
--   * player_presentation_pending_or_sold_key is a PARTIAL unique index whose
--     predicate is state in ('open','closing','sold'), which does not cover the
--     ('open','closing','sold','unsold') predicate the queries use;
--   * player_presentation_auction_id_idx and player_presentation_pkey do not
--     lead with player_entry_id.
-- Every such check therefore fell back to scanning the table per Player row.
-- This is a plain, non-unique index: the uniqueness invariants stay with the two
-- existing partial unique indexes.

create index if not exists "player_presentation_entry_state_idx"
  on "player_presentation" ("player_entry_id", "state");
