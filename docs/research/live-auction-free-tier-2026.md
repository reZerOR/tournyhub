# Live Auction reliability on the free tier

Research date: 2026-09-24. This is an architecture review of the checked-out code, not a production incident trace. The deployed revision, provider regions, request timings, and production logs were not available.

## Findings in this repository

- `LiveConsole` calls `loadSnapshotAction` every 2 seconds per tab. It does not create a Supabase Realtime subscription. Its `Reconnecting...` indicator means no successful snapshot was accepted for more than 6 seconds.
- The server Realtime distributor uses `discardRealtimeSender`, and `publishPendingOutbox` marks events published after handing them to that sender. The grant is an application HMAC, not a Supabase JWT. The current path does not deliver Supabase events.
- Every snapshot rebuilds the full player directory, team state, sales, bids, and other data with many database reads. The reads do not share a database snapshot. Polls and command responses can complete out of order, and the UI accepts either result without checking its revision.
- Manual Close stores a three-second deadline in PostgreSQL. The Organizer receives a snapshot in the command response, but Team Representatives rely on their next poll. A poll delayed by more than the remaining warning duration cannot show a useful countdown.
- Closing is woken by a browser action. The documented five-second Supabase Cron sweep is not implemented. After one automatic finalization attempt, `finalizingFor` blocks another attempt for the same presentation even if the request fails.
- The client marks the timer as `Sold` while finalization is still pending. This conflicts with the product specification's `Finalizing` state.
- `getPool()` uses the node-postgres default pool size for each Vercel process. Supabase recommends a much smaller application pool for serverless functions and its transaction pooler for serverless traffic.
- The existing `rehearsal:bid` script awaits each Bid in a loop. It does not create 40 concurrent browser sessions or exercise snapshot polling, so a passing result cannot rule out the reported failure.

## Current provider facts

- Supabase Free currently lists 200 concurrent Realtime connections and 100 messages per second. Exceeding the message rate can cause disconnects, but this repository has no active Realtime subscriber. [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- Supabase recommends Broadcast for database change notifications because Postgres Changes scales less well. [Supabase database change subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- Supabase recommends the shared transaction pooler for serverless functions and an application-side pool of one connection per warm instance initially. [Supabase database connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
- Vercel Functions cannot serve WebSockets. Browsers may connect directly to a separate Realtime provider. [Vercel limits](https://vercel.com/docs/limits)
- Vercel Hobby Cron runs at most daily and has imprecise timing. Supabase Cron can run jobs every second, although actual reliability still needs rehearsal. [Vercel Cron pricing and limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Supabase Cron](https://supabase.com/docs/guides/cron)
- Vercel's default Function region is Washington, DC unless changed; it advises placing Functions near the data source. This project's deployed setting needs verification. [Vercel Function regions](https://vercel.com/docs/functions/configuring-functions/region)
- Cloudflare Durable Objects are available on the Workers Free plan with a SQLite backend and daily usage limits. Migrating this application there would require a substantial architecture change, so it is not the first reliability fix for one Auction and 11 participants. [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Recommendation

Keep Vercel and Supabase for the small private beta. First measure browser request timings and Vercel/Supabase database errors during a representative 11-tab rehearsal. Reduce snapshot load, use revision-based polling or Supabase Broadcast as a notification to fetch an authoritative snapshot, reject older responses, and arrange database-side due-only finalization. Verify Vercel and Supabase are in nearby regions and use Supabase's transaction pooler with a deliberately small application pool. Do not treat a successful health endpoint as proof of Realtime delivery; its Realtime check only checks authentication configuration.
