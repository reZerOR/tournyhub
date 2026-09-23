# 05 — Wire UI to action in `live-console.tsx`

Status: ready-for-agent
Type: frontend
Blocked by: 04

## Goal

Connect the new `DirectSale` props/handlers in `LiveOrganizerTools` to the live console state and server action.

## File: `src/features/auctions/live/live-console.tsx`

1. Add local state near the existing correction state:
   ```ts
   const [directSalePlayerId, setDirectSalePlayerId] = useState("");
   const [directSaleTeamId, setDirectSaleTeamId] = useState("");
   const [directSaleAmount, setDirectSaleAmount] = useState(0);
   ```

2. Add a `handleDirectSale` async callback:
   ```ts
   const handleDirectSale = useCallback(async () => {
     if (!snapshot) return;
     setPending(true);
     const payload = await directSaleAction(auctionId, {
       amount: directSaleAmount,
       expectedRevision: snapshot.revision,
       playerEntryId: directSalePlayerId,
       reason: correctionReason,
       teamId: directSaleTeamId,
     });
     applyPayload(payload); // same helper used by other actions
     if (payload.outcome.status === "accepted") {
       // Reset fields on success
       setDirectSalePlayerId("");
       setDirectSaleTeamId("");
       setDirectSaleAmount(0);
     }
     setPending(false);
   }, [snapshot, directSaleAmount, directSalePlayerId, directSaleTeamId, correctionReason, auctionId]);
   ```

3. Load eligible players for Direct Sale — use the existing `eligiblePlayers` state (populated by `loadEligiblePlayersAction`) plus any unsold pool players from `snapshot.players` with status `"unsold"` that don't already have a sale. In the simplest implementation, just pass `eligiblePlayers ?? []` — the server command will reject ineligible players anyway.

4. Pass new props to `<LiveOrganizerTools>`:
   ```tsx
   directSaleAmount={directSaleAmount}
   directSalePlayerId={directSalePlayerId}
   directSaleTeamId={directSaleTeamId}
   eligiblePlayersForDirectSale={eligiblePlayers ?? []}
   onDirectSale={handleDirectSale}
   onDirectSaleAmountChange={setDirectSaleAmount}
   onDirectSalePlayerChange={setDirectSalePlayerId}
   onDirectSaleTeamChange={setDirectSaleTeamId}
   ```

## Done when

Triggering Direct Sale from the UI calls the action, updates the snapshot, and shows the acceptance notice.
