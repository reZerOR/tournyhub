# 02 — Server command: `directSale`

Status: ready-for-agent
Type: backend
Blocked by: 01

## Goal

Implement `directSale` in `src/server/auction-command/corrections.ts`.

## Interface

```ts
export interface DirectSaleInput {
  actorUserId: string;
  auctionId: string;
  commandId: string;
  expectedRevision: number;
  playerEntryId: string;
  teamId: string;
  /** Positive integer Credits to deduct from the Team Budget. */
  amount: number;
  reason: string;
}

export interface DirectSaleResult {
  amount: number;
  playerEntryId: string;
  saleId: string;
  teamId: string;
}

export async function directSale(
  pool: Pool,
  input: DirectSaleInput,
): Promise<LiveCommandOutcome<DirectSaleResult>>
```

## Validation order

1. Lock live auction; verify caller = Organizer (else `{ status: "unauthorized" }`).
2. Check stored command (idempotency replay).
3. Verify auction status = `'paused'` → reject `"auction_not_paused"`.
4. Verify `expectedRevision` → reject `"stale_revision"`.
5. Verify `reason` 1–200 chars → reject `"reason_required"`.
6. Verify `amount` is integer ≥ 1 → reject `"invalid_amount"` (new rejection reason).
7. Load player entry: exists in auction, `is_representative = false`, no unreversed sale, no open/closing presentation → reject `"player_already_sold"` or `"player_is_representative"` (new reasons) as appropriate.
8. Load team: exists in auction → `{ status: "unauthorized" }` if not found.
9. Load team budget remaining; verify ≥ amount → reject `"insufficient_budget"`.
10. Load roster count; verify < auction max → reject `"roster_max_reached"`.
11. If tiered rules: load team's tier count for player's tier; verify < tier max → reject `"tier_max_reached"`.
12. Insert `sale` row with `source = 'direct'`.
13. Run Legal Completion check; if fails, rollback → reject `"no_legal_completion"`.
14. Bump revision with event `"direct_sale"`, payload: `{ playerEntryId, teamId, amount, reason }`.
15. Write audit entry `action = "direct_sale"`.
16. Store command; commit.

## New rejection reasons

Add to `CORRECTION_REJECTION_REASONS` in `src/domain/live.ts`:
- `"invalid_amount"` → `"The amount must be a whole number of at least 1 Credit."`
- `"player_already_sold"` → `"That Player has already been sold."`
- `"player_is_representative"` → `"Player Representatives cannot be sold."`

Add to `CORRECTION_REJECTION_MESSAGES` accordingly.

## Notes

- Reuse `prelude()` from `corrections.ts` for steps 1–5.
- The budget check must query `"team"."budget" - coalesce(sum of unreversed sale amounts for this team, 0)` to get remaining budget.
- Legal Completion check: call `auctionKeepsLegalCompletion` _after_ inserting the sale row, inside the same transaction, same pattern as `reverseSale`.

## Done when

`directSale` is exported and all 16 steps are implemented with tests in `tests/unit/`.
