# Zero-cost beta architecture for TournyHub

Research date: 2026-09-19

This note separates documented service limits from TournyHub recommendations. Limits and pricing can change. Recheck them before launch.

## Decision

The proposed stack is suitable for a small, personal, non-commercial beta:

- Next.js with TypeScript on Vercel Hobby
- Supabase Free for PostgreSQL, Realtime, and Team logo storage
- Better Auth with Email OTP and Google sign-in
- Nodemailer through a dedicated Gmail account
- shadcn/ui, TanStack Query, and TanStack Table
- Zustand only for disposable local UI state, if React state becomes awkward

It is not suitable for the previously accepted production target of 500 connected clients per Auction, 50 simultaneous Live Auctions, or a guaranteed sub-500 ms Bid acknowledgement. The database must remain authoritative. Vercel serves pages and short HTTP commands; Supabase Realtime distributes committed state and never decides who won a Bid.

## Targets that must change for the free beta

| Target | Previously accepted | Free-beta operating limit | Reason |
| --- | ---: | ---: | --- |
| Simultaneous Live Auctions | 50 | 1 | Supabase Free has one project-wide Realtime connection and message-rate budget. |
| Teams in a Live Auction | Up to 32 | 16 recommended | This leaves room for the Organizer, duplicate representative tabs, and reconnects within the connection budget. Keep 32 in the domain model for later plans. |
| Connected clients per Auction | 500 | 40 browser tabs total | Supabase Free permits 200 peak connections, but each fan-out also consumes the 100 messages/second budget. Forty clients leave useful burst headroom. |
| Imported Players | 2,000 | 2,000 | Retain this application limit, but monitor database size and import memory. |
| Bid acknowledgement | Under 500 ms in normal conditions | Measure under 500 ms; launch gate p95 under 750 ms, no SLA | The path crosses Vercel and Supabase and neither free plan provides a latency guarantee. |
| Availability | Production service | Best-effort beta | Free Supabase projects can pause after low activity, Hobby usage can be stopped at plan limits, and Gmail can throttle automated mail. |
| Commercial use | Intended future product | Not allowed on Vercel Hobby | Hobby is restricted to personal, non-commercial use. |

The 40-client cap includes the Organizer, all Team Representative tabs, duplicate tabs, and reconnecting clients. A 16-Team Auction can therefore accommodate roughly 23 additional connected tabs. A 32-Team dry run leaves little connection headroom and is not the recommended beta shape.

## Documented platform facts

### Vercel Hobby

Vercel describes Hobby as a free plan for personal, non-commercial use. Its fair-use guidance says commercial use requires Pro or Enterprise, and its terms allow Vercel to suspend or remove Hobby deployments. A paid employee or consultant working on the deployment can also make the use commercial under the fair-use definition. [Hobby plan](https://vercel.com/docs/plans/hobby), [fair-use guidance](https://vercel.com/docs/limits/fair-use-guidelines), [terms](https://vercel.com/legal/terms)

Vercel's official WebSocket guidance is inconsistent. The Functions limits page says Functions cannot act as a WebSocket server and directs applications to external realtime providers. A newer Vercel knowledge-base article says a Function can accept a WebSocket, but the connection is pinned only for that Function invocation's maximum duration and later connections may reach other Functions. Either description makes a Vercel Function the wrong owner for a Live Auction. [Functions limits](https://vercel.com/docs/limits), [WebSocket knowledge-base article](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)

Recommendation: use Vercel for Next.js pages, Better Auth endpoints, imports, exports, and short `POST` Bid commands. Do not run a socket room, countdown loop, or in-memory Auction state in a Vercel Function.

### Supabase Free

Supabase currently documents these relevant Free quotas:

- Two active Free projects
- 500 MB database size per project
- 1 GB file storage and a 50 MB maximum file upload
- 5 GB egress and 5 GB cached egress
- 2 million Realtime messages per month
- 200 peak Realtime connections
- 100 Realtime messages per second

The database becomes read-only after it exceeds the 500 MB Free quota. A low-activity Free project may pause after seven days. Free does not provide the managed backup guarantees of paid plans, and a database backup contains Storage metadata, not the stored logo objects themselves. [Supabase pricing](https://supabase.com/pricing), [billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase), [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [database size](https://supabase.com/docs/guides/platform/database-size), [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [backups](https://supabase.com/docs/guides/platform/backups)

Realtime usage is counted per delivered message, not per logical Auction event. Supabase's example counts one Postgres change heard by five clients as five messages. A Broadcast sent to four subscribers counts the send plus four deliveries. [Realtime message usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)

This fan-out is why the recommended cap is well below the nominal 200 connections. Forty subscribers receiving two state events in one second consume about 80 delivered messages before protocol overhead and other channels. The client should render the countdown from a server deadline and its local clock. Never broadcast one timer message per second.

## Authoritative Bid path

Use a short authenticated HTTP request for each Bid:

1. The browser creates a random `client_command_id` and sends it with the Auction ID and offered amount to a Next.js Route Handler.
2. The server resolves the Better Auth session. It does not accept a User role, Team ID, balance, deadline, or eligibility decision from the browser.
3. The server calls one PostgreSQL function through a server-only connection. For a serverless runtime, use Supabase's transaction pooler and a least-privileged database credential. [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
4. The function locks the Auction's active lot and affected Team rows with `SELECT ... FOR UPDATE`, always in a fixed order. It validates Auction state, pause state, server deadline, representative membership, exact next price, Budget reserve, Roster size, and Tier constraints. PostgreSQL holds conflicting row locks until the transaction ends. [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html)
5. In the same transaction, it records the accepted or rejected command, updates current state for an accepted Bid, increments an Auction revision, and inserts a sanitized public event row.
6. A unique constraint on `(auction_id, client_command_id)` makes retries idempotent. A timed-out browser asks for that command's result rather than creating another logical Bid.
7. The HTTP response is sent only after the database transaction commits. That response is the Bid acknowledgement.
8. Supabase Realtime distributes only the committed event or resulting committed row. Realtime arrival order and client timestamps never determine the winner.

PostgreSQL logical decoding emits committed changes; rolled-back transactions are not decoded. Supabase recommends Broadcast for scalability and security, while Postgres Changes is simpler but scales less well. [Realtime architecture](https://supabase.com/docs/guides/realtime/architecture), [PostgreSQL logical decoding](https://www.postgresql.org/docs/current/logicaldecoding-output-plugin.html), [Broadcast versus Postgres Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)

Recommendation for the first beta: subscribe to an append-only, sanitized `auction_public_events` table with Postgres Changes. On reconnect, focus, or a revision gap, fetch an authoritative snapshot over HTTP. Before increasing the client cap, move fan-out to a database-triggered private Broadcast channel while keeping the same event schema and PostgreSQL ledger. Supabase documents Broadcast from database triggers for this pattern. [Broadcast from the database](https://supabase.com/docs/guides/realtime/broadcast)

The browser must never receive the Supabase service key or a database password. Because Better Auth sessions are not Supabase Auth sessions, keep all mutations and sensitive reads behind the Next.js server. Use the private-channel token broker described below for registered Auction participants. Broadcasts must exclude phone numbers, private notes, auth data, and hidden Team finances.

## Authentication and email

Better Auth supports Next.js, Google, PostgreSQL, and an Email OTP plugin. Configure passwords off, enable Google and Email OTP only, and keep the accepted OTP rules explicit: ten-minute expiry, five attempts, one-time use, hashed storage, a 60-second resend delay, and limits by normalized email and IP. Use generic responses so the endpoint does not reveal whether an email is registered. [Next.js integration](https://better-auth.com/docs/integrations/next), [Google provider](https://better-auth.com/docs/authentication/google), [Email OTP](https://better-auth.com/docs/plugins/email-otp)

Nodemailer documents Gmail as convenient for testing but not recommended for production automation. It recommends OAuth 2.0 for new integrations; an App Password is the simpler beta fallback and requires Google 2-Step Verification. Google documents a 500-message or recipient daily limit for a personal Gmail account and can block further sending for 1 to 24 hours after a limit is reached. App Passwords can be unavailable for some account security configurations and are revoked after the Google account password changes. [Nodemailer Gmail guide](https://nodemailer.com/guides/using-gmail), [Nodemailer OAuth 2.0](https://nodemailer.com/smtp/oauth2), [Gmail sending limits](https://support.google.com/mail/answer/22839), [Google App Passwords](https://support.google.com/accounts/answer/185833)

Recommendation: use a dedicated Gmail account with OAuth 2.0 credentials stored only in Vercel secrets. Keep an App Password as a beta-only fallback, never the account's normal password. Cap all application email at 250 messages per rolling 24 hours so OTP retries and ordinary account mail have room. Record provider failures and show a retry path. Move to a transactional provider before public or commercial launch, at the first persistent throttle or delivery problem, or when volume approaches 250 messages per day.

Gmail is not a durable queue. An accepted OTP request can still fail to deliver. Do not claim guaranteed login delivery on this beta stack.

## UI and client state

Next.js has first-class TypeScript and App Router support. shadcn/ui installs source-owned components into the application rather than hiding them behind a remote component service. TanStack Query fits snapshots, HTTP mutations, reconnect refetches, and revision-based cache invalidation. TanStack Table fits headless, typed Player, Roster, import-preview, and Audit tables. [Next.js TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript), [shadcn/ui for Next.js](https://ui.shadcn.com/docs/installation/next), [TanStack Query SSR](https://tanstack.com/query/latest/docs/framework/react/guides/ssr), [TanStack Table](https://tanstack.com/table/latest/docs/overview)

Use TanStack Query as the client copy of server state. A committed Realtime event should update or invalidate that cache. Zustand is optional and should hold only disposable UI state such as filters, dialogs, selected rows, import mapping, connection indicators, and a locally rendered countdown. It must not own balances, winning Bids, Rosters, or Auction state. [Zustand introduction](https://zustand.docs.pmnd.rs/learn/getting-started/introduction)

## Logos, imports, and exports

Store Team logos in Supabase Storage. Although the plan permits much larger objects, enforce a 1 MB application limit, allow JPEG, PNG, or WebP only, reject SVG, validate the decoded image, re-encode it, use generated object keys, and cache public logo variants. The 1 GB storage quota is unlikely to be the first limit; the 5 GB egress quota can be, so avoid original-size images in lists.

Keep the accepted 2,000-Player import limit. Parse CSV with `csv-parse` and XLSX with SheetJS Community Edition, with byte, row, worksheet, column, and cell-length limits. Preview normalized data and commit the import all-or-nothing in a database transaction. Treat formulas and links as data. Generate CSV from the result read model and use `pdf-lib` for the initial PDF result sheet. Large workbooks or elaborate PDFs should wait for a background-job service after migration. [CSV Parse streams](https://csv.js.org/parse/examples/stream_pipe/), [SheetJS input](https://docs.sheetjs.com/docs/solutions/input/), [pdf-lib](https://pdf-lib.js.org/)

Run regular off-site database dumps and copy Storage objects separately. A Free project and its only copy of the data are not a backup strategy.

## Capacity guardrails

Add visible admin metrics and reject new work before vendor limits do:

- One Live Auction at a time
- 16 Teams recommended, 32 retained as a tested domain maximum
- 40 total Realtime connections in the beta
- At most two public state fan-outs per second; coalesce spectator snapshots when Bids arrive faster
- Alert at 120 Realtime connections even in staging or exceptional tests
- Alert at 60 messages/second sustained and 70 messages/second in short windows
- Alert at 1.2 million monthly Realtime messages
- Alert at 350 MB database size
- Alert at 700 MB Storage and 3.5 GB egress
- Alert at 200 Gmail messages per day; stop nonessential sends at 250

These are TournyHub recommendations, not vendor guarantees. Load-test the complete browser-to-commit path with the chosen Vercel and Supabase regions before inviting users. Test simultaneous Bids, exact timer boundaries, pause/resume, duplicate commands, function timeout after commit, disconnect/reconnect, revision gaps, database read-only mode, Gmail failure, and a paused Free project.

## Migration to production

The first paid step is not a rewrite:

1. Move Vercel to Pro, or to another host that permits commercial use.
2. Move Supabase to a paid plan for no inactivity pause, larger quotas, support, and managed backup features. Add tested point-in-time recovery if the event's loss tolerance requires it.
3. Replace Gmail with a transactional email provider using a verified sending domain, delivery webhooks, and a queue with retry and dead-letter handling.
4. Keep the PostgreSQL Bid function, command idempotency key, revisioned event schema, and HTTP acknowledgement contract.
5. Replace only the live distribution adapter when concurrency outgrows Supabase Realtime. The production option in [architecture-options.md](architecture-options.md) uses one Cloudflare Durable Object per Auction. A container WebSocket service with Redis Streams is another valid path.
6. Put imports and PDF generation on a background worker when request duration or memory becomes material.

The accepted target of 500 clients in each of 50 simultaneous Auctions means up to 25,000 live connections. Do not infer support for that target from a paid Supabase plan name. Obtain the current provider limits or adopt the per-Auction coordinator design, then prove 25,000 connections and the Bid burst profile in a representative load test. The sub-500 ms target becomes a production objective only after the application, database, and realtime service are colocated appropriately and p50, p95, and p99 measurements pass under load.

## Go or no-go

Go for a private, non-commercial beta only if the limits above are enforced and database dumps are tested.

Do not use this exact free stack for paid events, sponsorship, advertising, client work, or any other commercial deployment. Do not promise 500 connected clients per Auction, 50 simultaneous Auctions, production availability, guaranteed OTP delivery, or a sub-500 ms SLA. Migrate before any of those become requirements.

## Timed close and private Realtime authorization

### Close without a permanent server

Make the PostgreSQL deadline authoritative and make close finalization idempotent. Store `closes_at` as `timestamptz` in UTC. A timed Bid is valid only while the lot is open and the database observes `clock_timestamp() < closes_at` after locking the lot row. PostgreSQL documents that `now()` and `current_timestamp` return the transaction start time, while `clock_timestamp()` returns the actual current time during statement execution. Using `now()` could let a transaction that waited on a lock retain an earlier timestamp. [PostgreSQL current time functions](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)

Use one database function for every close path:

1. Lock the active lot with `SELECT ... FOR UPDATE`.
2. If it is already closed, return the stored result without another Sale, refund, or event.
3. For a timed close, refuse to finalize before `closes_at`. For a manual close, require the server-verified Organizer identity.
4. Apply the winner or Unsold result, Budget and Roster changes, Audit Entry, Auction revision, and committed Realtime event in the same transaction.

The Bid function must call the same due-close logic after it obtains the lock. If the deadline has passed, it finalizes first and rejects the Bid. This rule preserves the deadline even when every scheduler is late or unavailable. For the free beta, the documented boundary is database validation time, not the browser's click time or a timestamp supplied by the client.

The Next.js server should also call the due-only function before returning a Live Auction snapshot. At the displayed deadline, a connected browser may send an idempotent finalize request, but the browser is only a wake-up signal. Reconnect, focus, and Organizer dashboard access provide more lazy finalization opportunities. Clients stop offering the Bid control when their countdown reaches zero and wait for the committed revision before displaying a winner.

Use one Supabase Cron sweeper, not one Job per lot. Run it every five seconds and let it finalize a bounded batch of due lots with the same function. Supabase Cron uses `pg_cron`, can run SQL or database functions, and documents schedules from every second to once a year. Seconds syntax requires PostgreSQL 15.1.1.61 or later. Supabase recommends at most eight concurrent Jobs and a maximum ten-minute runtime per Job. [Supabase Cron](https://supabase.com/docs/guides/cron), [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart)

Prune old rows from `cron.job_run_details`. Supabase warns that `pg_cron` does not clean this history automatically, which matters under the 500 MB database cap. [Supabase upgrade notes](https://supabase.com/docs/guides/platform/upgrading#pg_cron-usage)

Supabase documents `pg_cron` as a hosted-platform extension and does not list a paid-plan restriction in its Cron or pricing documentation. The pricing table does not explicitly promise Cron on Free, so enabling the extension in the target Free project remains a launch check. Supabase labels the Cron module beta. A paused Free project cannot run its database worker; lazy finalization must catch up after restoration. [Scheduling with `pg_cron`](https://supabase.com/docs/guides/functions/schedule-functions), [Cron feature status](https://supabase.com/features/supabase-cron), [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

Vercel Hobby Cron is not a close scheduler. Hobby Jobs can run only once per day, may execute anywhere within the selected hour, and are not retried after failure. [Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

Pause and resume must update the timer under the same lot lock. On pause, store the remaining duration and clear `closes_at`. On resume, calculate a new database deadline from `clock_timestamp()` plus the stored duration. The sweeper must select only open, unpaused lots.

Recommendation: combine all three mechanisms. The database deadline and idempotent function enforce correctness. A five-second Supabase Cron sweep closes unattended lots. Access-triggered finalization gives faster recovery and remains the fallback. Do not depend on Vercel Hobby Cron or an open browser tab.

### Better Auth to private Supabase Realtime

A Better Auth session cookie is not a Supabase access token. Better Auth's JWT plugin can issue asymmetric, JWKS-verifiable tokens for external services, but Supabase does not document Better Auth among its first-class third-party Auth integrations. Do not assume that installing the plugin makes its JWTs trusted by Supabase. [Better Auth JWT plugin](https://better-auth.com/docs/plugins/jwt), [Supabase third-party Auth](https://supabase.com/docs/guides/auth/third-party/overview)

Use a small Next.js token broker:

1. A registered User calls `/api/realtime-token` with the normal Better Auth session cookie. The server verifies the session and current Auction membership.
2. The server issues a short-lived Supabase-compatible JWT, recommended lifetime two to five minutes. Sign it with an asymmetric key that was generated outside Supabase, imported as a Supabase JWT signing key, and stored only in Vercel server secrets. Set `role` to `authenticated`, set `exp`, and add narrow claims such as `app_user_id`, `auction_id`, and `auction_access`. Never mint `service_role`. Supabase documents externally minted tokens using an imported key and recommends short expiry. [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
3. The browser creates the Supabase client with the public publishable key and an `accessToken` callback that fetches or refreshes this JWT. Supabase documents the callback for custom JWTs, and `realtime.setAuth()` can update the token used for channel authorization. The service key and JWT private key never enter browser code. [Custom JWT `accessToken`](https://supabase.com/docs/guides/auth/jwts#using-custom-or-third-party-jwts), [Realtime `setAuth`](https://supabase.com/docs/reference/javascript/setauth)
4. Disable Realtime's `Allow public access` setting. Join `auction:<auction_id>` with `private: true`. Give browser roles only `SELECT` access for Broadcast messages. The RLS policy on `realtime.messages` must compare `realtime.topic()` with the token's exact Auction claim and accepted access value. Do not grant browser `INSERT`; only the database trigger publishes events. [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization), [Realtime settings](https://supabase.com/docs/guides/realtime/settings)

For the current Postgres Changes beta path, apply an equivalent `SELECT` RLS policy to `auction_public_events`. Supabase sends a changed row only when that JWT may read the row. When the application moves to database-triggered Broadcast, the `realtime.messages` policy becomes the channel gate.

Realtime caches a private channel's authorization decision for the connection. It recalculates on join or when the client supplies a new JWT, and disconnects a client whose JWT expires without refresh. Short JWT lifetimes therefore bound link or membership revocation delay. Sensitive actions still use Better Auth over HTTP and do not wait for Realtime token expiry. [Realtime policy refresh behavior](https://supabase.com/docs/guides/realtime/authorization#updating-rls-policies)

Recommendation: use private channels and the token broker for Organizers and Team Representatives. Treat a public channel with an unguessable topic as a temporary fallback only. Supabase states that anyone with the project's public key can use public channels, so topic secrecy alone is weaker than a short-lived JWT plus RLS.
