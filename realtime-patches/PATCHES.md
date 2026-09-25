# Realtime patch: apply in this order

Flow after the patch: a command commits -> `settle()` broadcasts `{ revision }` (one awaited HTTP call, in parallel with the caller's snapshot load) -> every client whose revision is older calls `GET /api/auctions/:id/snapshot?since=N` -> the server answers with a tiny "unchanged" or a full snapshot. A 15 s poll (3 s if the socket is down) is only a safety net.

## 0. Setup
- `npm i @supabase/supabase-js`
- Env (Vercel + local): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (if the REST broadcast returns 401 with a new `sb_publishable_...` key, use the legacy anon JWT key)
- Supabase dashboard -> Realtime settings: public channels must be allowed.
- Add the 4 new files at the paths in their first-line comments.

## 1. `src/server/realtime/grant.ts`: unguessable topic
Supabase cannot verify your HMAC grant token, so the channel name itself becomes the secret. Only a user who passes `resolveLiveRole` is told it.

```ts
/** Secret topic: only Users who pass the role check ever receive it. */
export function auctionBroadcastTopic(auctionId: string): string {
  return `auction:${auctionId}:${sign(`topic|${auctionId}`).slice(0, 24)}`;
}
```
and in `grantRealtimeAccess`, return `channel: auctionBroadcastTopic(auctionId)` instead of `auctionChannelName(auctionId)`.
(If a test asserts `channel === auctionChannelName(id)`, update it.)

## 2. `src/features/auctions/live/live-actions.ts`
Remove: the `declare global`, `distributor()`, and the imports of `CoalescingRealtimeDistributor`, `discardRealtimeSender`, `publishPendingOutbox`.
Add `import { notifyRevision } from "@/server/realtime/notify-revision";` and replace `settle`'s first lines:

```ts
async function settle(auctionId, userId, outcome, notice?) {
  const pool = getPool();
  const [, access] = await Promise.all([
    notifyRevision(pool, auctionId),
    getLiveSnapshot(pool, userId, auctionId),
  ]);
  return {
    outcome: viewOutcome(outcome, notice),
    snapshot: access?.snapshot ?? null,
  };
}
```
`loadSnapshotAction` is no longer used and can be deleted.

## 3. `live-console.tsx`

**a) Delete** `refreshing`, the `refresh` callback and the polling `useEffect` (the one with `setInterval(..., POLL_INTERVAL_MS)` and the focus/online listeners). Remove the `loadSnapshotAction` import.

**b) `accept`**: ignore late, older responses (needed now that polls are no longer serialized with your actions) and stop setting the clock offset here:

```ts
const accept = useCallback((next: LiveSnapshot) => {
  const previous = previousSnapshot.current;
  if (next.revision < previous.revision) return; // a slower, older response
  const change = describeLiveChange(previous, next);
  const cue = soundCueFor(previous, next);
  previousSnapshot.current = next;
  if (change) setAnnouncement(change);
  if (cue) playCue(cue);
  setSnapshot(next);
  setLastSyncedAt(Date.now());
}, [playCue]);
```

**c) Add the hook** right after `accept`:

```ts
useLiveSync({
  auctionId,
  revision: snapshot.revision,
  onSnapshot: accept,
  onSynced: () => setLastSyncedAt(Date.now()),
  onClockOffset: setClockOffsetMs,
  onLost: () => setMessage("This Auction is no longer live, or you no longer have access."),
});
```
(import `useLiveSync` from `./use-live-sync`)

**d) Stale threshold**: `POLL_INTERVAL_MS * 3` (6 s) is now wrong because healthy sockets sync every 15 s.

```ts
const STALE_AFTER_MS = 20_000;
const connectionStale = now - lastSyncedAt > STALE_AFTER_MS;
```
Keep `POLL_INTERVAL_MS` only as the idle `now` tick.

**e) Organizer eligible-players refetch**: stop refetching on every bid.
Change the dependency array of that effect from `[auctionId, role, snapshot.revision]` to
`[auctionId, role, snapshot.eligiblePlayerCount, snapshot.activePlayer?.presentationId, snapshot.lifecycle, snapshot.activeTierId]`.

**f) Optional, stagger `finalizeAction`** so 11 clients don't all fire at the deadline:

```ts
useEffect(() => {
  if (!activePlayer || !finalizing) {
    finalizingFor.current = null;
    return;
  }
  const presentationId = activePlayer.presentationId;
  if (finalizingFor.current === presentationId) return;
  const delay = role === "organizer" ? 0 : 1500 + Math.random() * 1000;
  const timer = setTimeout(() => {
    if (previousSnapshot.current.activePlayer?.presentationId !== presentationId) return; // already resolved
    finalizingFor.current = presentationId;
    void dispatch(finalizeAction(auctionId, { presentationId }));
  }, delay);
  return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activePlayer?.presentationId, finalizing]);
```

## Things to verify
1. Every state-changing command bumps `auction.revision` (your `expectedRevision` design suggests yes). Anything that changes the snapshot WITHOUT bumping it, e.g. the `rejections` list of rejected bid attempts, will not reach other clients through the "unchanged" check.
2. The snapshot must be JSON-serializable (no `Date`, `Map`, `bigint`). Server Actions allowed those; the route handler does not. From `live-snapshot.ts` it looks fine (ISO strings).
3. `getPool()` should use the Supabase pooler URL (transaction mode) with a small `max`.
4. Test: 11 browsers, then kill Wi-Fi on one: the header should flip to "Reconnecting…" after 20 s and recover on reconnect.
