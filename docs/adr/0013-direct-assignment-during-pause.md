# Direct Assignment during Pause

## Context

The product spec allows the Organizer to make fairness-affecting corrections only while the Auction is Paused, routed through the Auction Command module (ADR-0009). One pause-time action is a **Direct Assignment**: assigning a pre-registered Player to a Team at a custom Credit amount, bypassing the bidding flow.

## Decision

Direct Assignment creates a `sale` row with `source = 'direct'` and `presentation_id = NULL`, since there is no `player_presentation` in the bypass flow. The schema migration `20260922130002` makes `sale.presentation_id` and `unsold_membership.presentation_id` nullable to accommodate this.

Direct Assignment routes through the same `corrections.ts` command module as Cancel Bid and Reverse Sale, because:

1. It is only permitted while Paused, so it cannot race live bidding.
2. It enforces the same Budget, Roster, Tier, and Legal Completion constraints.
3. It records an immutable Audit Entry and bumps the revision like every correction.

A Direct Assignment is reversible through the normal `reverseSale` flow. Because the Sale has no `presentation_id`, the reversal skips the `player_presentation` state transition and inserts an `unsold_membership` row with `presentation_id = NULL`, returning the Player to the Unsold Pool.

## Consequences

- The `sale` and `unsold_membership` tables allow NULL `presentation_id`, weakening the prior invariant that every sale derives from a presentation.
- `LiveSale`, `OpenSale`, `LiveRosterPlayer`, `ResultsSource`, and all query return types must include `'direct'` in their source union to avoid type mismatches and missing label lookups.
- The Results export renders "Direct Assignment" for these Players via `RESULTS_SOURCE_LABELS`.
