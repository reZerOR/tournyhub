# 03 — Server action: `directSaleAction`

Status: ready-for-agent
Type: backend
Blocked by: 02

## Goal

Add `directSaleAction` to `src/features/auctions/live/live-actions.ts`.

## Implementation

```ts
export async function directSaleAction(
  auctionId: string,
  input: {
    amount: number;
    expectedRevision: number;
    playerEntryId: string;
    reason: string;
    teamId: string;
  },
): Promise<LiveActionPayload> {
  const session = await getCurrentSession();
  if (!session) return { outcome: { status: "unauthorized" }, snapshot: null };

  const outcome = await directSale(getPool(), {
    actorUserId: session.user.id,
    auctionId,
    amount: input.amount,
    commandId: randomUUID(),
    expectedRevision: input.expectedRevision,
    playerEntryId: input.playerEntryId,
    reason: input.reason,
    teamId: input.teamId,
  });
  return settle(
    auctionId,
    session.user.id,
    outcome,
    outcome.status === "accepted"
      ? `Direct Sale: ${outcome.result.amount.toLocaleString()} Credits.`
      : undefined,
  );
}
```

Import `directSale` from `@/server/auction-command/corrections`.

## Done when

Action is exported, compiles, and `directSale` is imported correctly.
