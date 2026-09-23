# Direct Sale

Status: ready-for-agent

## Problem

During a live auction, the Organizer sometimes needs to assign a pre-registered Player directly to a specific Team at a custom credit amount — bypassing the normal bidding round entirely. This is useful for last-minute deals, penalty assignments, or administrative corrections the Organizer has agreed upon out-of-band.

## Terminology (from CONTEXT.md)

- **Direct Sale**: An Organizer correction that assigns a Player from the Unsold Pool to a named Team at a chosen Credit amount, without a bidding round. The auction must be Paused. The term "Direct Sale" is new; it is a subtype of Sale with `source = 'direct'`.
- **Organizer**: The User who creates and controls the Auction. Only the Organizer may perform a Direct Sale.
- All other terms (Player Entry, Team, Budget, Roster, Credits, Sale, Legal Completion, etc.) retain their CONTEXT.md definitions.

## User Story

As an Organizer, while the auction is Paused, I can select any Player who has not yet been sold (eligible players from the Unsold Pool or those not yet offered), choose a Team, enter a Credit amount, and commit a Direct Sale — so I can manually resolve player assignments I have arranged outside the bidding process.

## Scope

### In scope

1. **New server command `directSale`** in `src/server/auction-command/corrections.ts`
   - Organizer only; Paused Auction only.
   - Input: `auctionId`, `playerEntryId`, `teamId`, `amount`, `reason`, `expectedRevision`.
   - Validations (in order):
     1. Auction exists, is Paused, caller is Organizer.
     2. `reason` is 1–200 characters.
     3. `amount` is a positive integer (≥ 1).
     4. `expectedRevision` matches current revision.
     5. Player Entry exists in this Auction and has no active unreversed Sale.
     6. Player is not a Player Representative (`is_representative = false`).
     7. Player has no open/closing Presentation (no active player_presentation in state `open` or `closing`).
     8. Team exists in this Auction.
     9. Team's remaining Budget ≥ `amount`.
     10. Team's Roster count < Auction maximum.
     11. If Tiered Rules: Team's count for the Player's Tier < tier max.
     12. Legal Completion check still passes after the Sale.
   - On success: inserts a `sale` row (`source = 'direct'`), bumps revision with event `direct_sale`, writes audit entry `direct_sale`.
   - Returns: `DirectSaleResult { amount, playerEntryId, saleId, teamId }`.

2. **New Server Action `directSaleAction`** in `src/features/auctions/live/live-actions.ts`
   - Mirrors the pattern of `reverseSaleAction`.
   - Accepts `{ auctionId, input: { playerEntryId, teamId, amount, reason, expectedRevision } }`.

3. **UI — "Direct Sale" tab** inside `LiveOrganizerTools` (visible when Paused)
   - Tab label: "Direct Sale" with a `ShoppingCart` or `ArrowRightCircle` icon.
   - Controls:
     - **Player selector**: a `<Select>` listing all unsold/not-yet-offered Players (reuses `loadEligiblePlayersAction` plus additionally unsold pool players not already sold). The label shows `displayName (tier · starting X cr)` if applicable.
     - **Team selector**: a `<Select>` listing all Teams (from snapshot `teams`).
     - **Amount field**: a numeric `<Input>` (integers only, min 1).
     - **Reason field**: a text `<Input>` (same as other correction fields; shared state with the existing `correctionReason`).
     - **"Confirm Direct Sale" button**: disabled when any field is empty, or while `pending`.
   - On submit: calls `directSaleAction`, surfaces the standard outcome toast / notice.

4. **Snapshot update** — the LiveSnapshot already contains `openSales` (reversible sales). After a Direct Sale, it appears in `openSales` just like a bid-based Sale, so Sale Reversal continues to work.

5. **Audit trail** — `audit_entry.action = 'direct_sale'`, details include `playerEntryId`, `teamId`, `amount`, `reason`.

6. **Migration** — add `'direct'` to the `sale_source` check constraint in a new migration file.

### Out of scope

- Adding brand-new Players during a live auction.
- Direct Sale while the auction is Live (not Paused).
- Changing an existing sale amount.
- UI outside the Organizer's live console.

## Acceptance criteria

1. When Paused, the Organizer sees a "Direct Sale" tab in the Admin toolkit.
2. Submitting with a valid Player, Team, amount, and reason deducts the credits and adds the Player to the Team Roster.
3. The sale appears in the "Corrections & Reversals" tab as a reversible Sale (source = "direct").
4. If the Team's Budget is insufficient, the command returns a rejection with reason `insufficient_budget`.
5. If the Team's Roster is already at maximum, the command returns `roster_max_reached`.
6. If Tiered and the Team's Tier count is at maximum, the command returns `tier_max_reached`.
7. If Legal Completion would break, the command returns `no_legal_completion`.
8. If the Player already has an active Sale, the command returns `player_already_sold`.
9. All rejections surface a readable message in the UI.
10. The Audit log records `direct_sale` with actor, timestamp, player, team, amount, and reason.

## Implementation tickets

See `issues/` directory.
