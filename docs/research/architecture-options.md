# Architecture options for the TournyHub auction MVP

Research date: 2026-09-19

This note separates facts stated by vendors and maintainers from recommendations for TournyHub. Capacity and latency figures are targets, not vendor guarantees. The proposed stack still needs a representative load test before launch.

## Recommendation

Use a TypeScript monorepo with these deployable parts:

- A React Router full-stack application on Cloudflare Workers for pages, forms, authentication endpoints, imports, and ordinary API calls.
- One Cloudflare Durable Object per live Auction. It owns the Auction's WebSocket connections, command order, timer, and live broadcast.
- Managed PostgreSQL in AWS `ap-southeast-1` behind Cloudflare Hyperdrive. Use Drizzle ORM with `node-postgres` for normal access and explicit SQL inside the Bid transaction.
- Better Auth with its Email OTP plugin and Google provider.
- Resend for OTP and invitation email.
- Cloudflare R2 for Team logos.
- `csv-parse` for CSV, SheetJS Community Edition for XLSX, and `pdf-lib` for PDF results.

This choice fits the workload shape. TournyHub has many independent rooms with one ordered command stream in each room. Durable Objects are designed around a single, globally addressable coordinator with private storage. Cloudflare documents a soft limit of 1,000 requests per second per object and a maximum of 32,768 hibernating WebSockets per object. TournyHub's target of 500 clients in each of 50 Auctions is below those documented per-object limits, and the 50 Auctions use 50 independent objects. These figures do not prove that the application code will meet the latency target. [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [WebSocket state API](https://developers.cloudflare.com/durable-objects/api/state/)

## Option comparison

| Area | Recommended | Main alternative | Reason for the choice |
| --- | --- | --- | --- |
| TypeScript web framework | React Router framework mode | Next.js App Router | Cloudflare has a first-class React Router and Workers setup with direct bindings to Durable Objects. Next.js is a sound UI choice, but Cloudflare's current preferred Next.js path, vinext, is still beta. [React Router on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/), [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) |
| PostgreSQL layer | Drizzle ORM plus `pg` | Prisma or direct `pg` | Drizzle exposes transaction isolation configuration and an SQL escape hatch while retaining a typed schema. Cloudflare documents Drizzle and `pg` support through Hyperdrive. Prisma also works, but adds a generated client without removing the need for explicit concurrency SQL. Direct `pg` gives full control but leaves more schema and mapping code to maintain. [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [Drizzle with Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/), [Prisma with Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/prisma-orm/) |
| Authentication | Better Auth | Auth.js or custom auth | Better Auth documents Email OTP, Google, PostgreSQL and Drizzle integration, and same-email account linking when the provider verifies the address. This directly matches the accepted product rules. [Email OTP](https://better-auth.com/docs/plugins/email-otp), [Google](https://better-auth.com/docs/authentication/google), [account linking](https://better-auth.com/docs/concepts/users-accounts), [Drizzle adapter](https://better-auth.com/docs/installation) |
| Live transport | Native WebSocket to one Durable Object per Auction | Socket.IO on containers with Redis Streams | A per-Auction object gives one coordination point and removes cross-node Bid ordering from the socket layer. Socket.IO guarantees event order only for events that arrive, and its default arrival guarantee is at most once. Multiple Socket.IO nodes also need session affinity and an inter-node adapter. [Socket.IO delivery](https://socket.io/docs/v4/delivery-guarantees/), [multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/), [Redis Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/) |
| Hosting | Cloudflare Workers, Durable Objects, Hyperdrive, and R2 | AWS ECS/Fargate, ALB, RDS, ElastiCache, and S3 | The Cloudflare design maps one actor to one Auction and needs no load-balancer affinity or Redis fanout. The AWS design is valid and offers more runtime control, but the application must build its own per-Auction sequencing and recovery layer. AWS ALB supports WebSockets and ECS supports service autoscaling. [ALB WebSockets](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html), [ECS service autoscaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html) |
| Transactional email | Resend | Amazon SES | Resend has a small HTTPS API, idempotency keys, webhooks, and a documented default API rate of 10 requests per second. SES is mature and can be cheaper at volume, but new accounts start in a sandbox and must request production access. [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Resend rate limit](https://resend.com/changelog/api-rate-limit), [SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) |
| Team logo storage | Cloudflare R2 | Amazon S3 | R2 is available as a Worker binding and supports short-lived S3-compatible presigned uploads. A custom domain can cache public logos. S3 is the natural choice if the container-based AWS option is selected instead. [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [S3 presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) |

## Authoritative Bid path

Documented facts:

- A Durable Object is a globally addressable, single-threaded coordinator with strongly consistent local storage. Cloudflare recommends one object per logical coordination unit such as a room or game. Awaiting external I/O can still allow request interleaving, so single-threaded JavaScript alone is not a complete ordering mechanism. [Durable Object model and concurrency](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- PostgreSQL `SELECT ... FOR UPDATE` prevents another transaction from changing or locking the same row until the first transaction ends. PostgreSQL advises keeping transactions short and acquiring multiple locks in a consistent order. [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- Hyperdrive uses transaction pooling and holds one database connection for a transaction. It does not support PostgreSQL advisory locks, `LISTEN`, or `NOTIFY`. [Hyperdrive behavior](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/), [supported features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/)

Recommended command flow:

1. The browser sends `place_bid` with an Auction ID, a client-generated command UUID, the last observed Auction revision, and no client timestamp used for ordering.
2. The Auction Durable Object authenticates the session and confirms that the User is the current Team Representative.
3. The object writes the command to its local SQLite inbox and assigns a monotonic Auction sequence. That durable sequence defines "received by the server" for ADR 0002.
4. A per-object drain loop processes inbox rows in sequence. Do not hold `blockConcurrencyWhile()` across PostgreSQL or email I/O. New messages may append to the inbox while one command is processing, but only one drain loop applies commands.
5. A short PostgreSQL transaction locks the Active Player or Auction state row with `FOR UPDATE`, checks pause and close state, next price, Team eligibility, Budget reserve, Roster and Tier limits, and idempotency, then writes the accepted or rejected Bid, Audit Entry, state changes, and next revision atomically.
6. PostgreSQL has unique constraints on `(auction_id, command_id)` and `(auction_id, auction_sequence)`. If the object retries after a crash, the transaction returns the result already stored for that command instead of applying it again.
7. Only after PostgreSQL commits does the object acknowledge the command and broadcast the new revision. Clients reconnect with their last revision and request missed events or a fresh snapshot.

PostgreSQL remains the durable source for Auction history and final results. The Durable Object inbox is a coordination and recovery record, not a second editable copy of the domain model. Retain processed inbox rows long enough to cover reconnect and retry, then expire them by policy.

This design gives a precise acceptance point, idempotent recovery, and an immutable result for every submitted Bid. A WebSocket send or transport acknowledgement by itself must never mean that a Bid won.

## Authentication details

Configure Better Auth with passwords disabled, the Email OTP plugin, and Google only. Use a 6 or 8 digit code with a 10 minute expiry, a bounded attempt count, and hashed OTP storage. Better Auth's Email OTP defaults include a six digit code, a five minute expiry, three allowed attempts, and plain storage, so TournyHub must set its accepted values explicitly. The application must enforce the accepted 60 second resend delay and rate limits by email and IP. [Email OTP options](https://better-auth.com/docs/plugins/email-otp)

Keep same-email account linking enabled only when Google supplies a verified email. Keep `allowDifferentEmails` false. Better Auth states that verified same-email OAuth accounts link by default and warns that forced trust can increase account takeover risk. [Better Auth account linking](https://better-auth.com/docs/concepts/users-accounts)

For the WebSocket handshake, pass the normal secure session cookie to the Worker and resolve the session server-side. Never accept a Team ID or role from an unsigned client claim.

Send OTP email immediately through Resend and use an idempotency key. Better Auth recommends not awaiting the provider inside its callback when the runtime offers a background continuation mechanism. Record provider acceptance and process signed delivery and bounce webhooks. [Better Auth email sending note](https://better-auth.com/docs/plugins/email-otp), [Resend webhooks](https://resend.com/docs/webhooks/introduction)

## Files and exports

Recommended libraries and controls:

- Parse CSV with `csv-parse` using its stream API. Parse XLSX with a pinned SheetJS Community Edition release from the project's official distribution, using `ArrayBuffer` input and dense mode. SheetJS documents Workers-specific loading and notes that workbook parsing is in-memory. The 2,000 Player limit is small enough to start here, but still enforce byte, row, column, worksheet, and cell-length limits before mapping. [CSV Parse stream example](https://csv.js.org/parse/examples/stream_pipe/), [SheetJS data import](https://docs.sheetjs.com/docs/solutions/input/), [SheetJS large data behavior](https://docs.sheetjs.com/docs/demos/bigdata/stream/)
- Treat imported cells as data. Do not execute formulas, fetch external workbook links, or render imported HTML. Preview the normalized rows and perform the accepted all-or-nothing validation before inserting them in one transaction.
- Generate result PDFs with `pdf-lib`, which is written in TypeScript, has no native dependency, and works in JavaScript runtimes. Generate large exports as background jobs and store the result in R2 rather than holding an HTTP request open. [pdf-lib](https://pdf-lib.js.org/)
- Generate CSV directly from the same read model used by the results page. Escape spreadsheet formula prefixes in exported User-controlled values.
- Upload Team logos to a unique R2 object key with a short-lived presigned `PUT`. Restrict the signed content type, enforce a small byte limit, decode and validate the image after upload, strip metadata by re-encoding, and publish only the processed object. R2 notes that a presigned URL is a bearer token and remains reusable until expiry. [R2 presigned URL security](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

## Deployment shape

Use one repository with `apps/web`, `workers/auction`, and shared packages for domain types, validation schemas, database schema, and authorization policy. React Router and the Auction Worker can deploy independently even if they share a Cloudflare account and bindings.

Place PostgreSQL in Singapore for the initial Dhaka-centered audience. Hyperdrive supports PostgreSQL and both Drizzle and `pg`; it reduces connection setup round trips but does not remove the distance to the primary database for writes. [Hyperdrive overview](https://developers.cloudflare.com/hyperdrive/), [driver support](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)

Run schema migrations from CI with a direct database connection, never during a Worker request. Keep separate production and staging databases, Durable Object namespaces, R2 buckets, auth secrets, Google OAuth clients, and Resend domains.

## Required proof before launch

Do not claim the 500 ms Bid acknowledgement target until a test proves it. Test at least 50 concurrent Auctions, 500 WebSockets per Auction, bursts from all 32 Team Representatives, participant reconnects, timed close boundaries, and a mix of accepted and rejected Bids. Measure p50, p95, and p99 from browser send to committed acknowledgement.

The failure suite must kill the Auction object after inbox persistence, during the PostgreSQL transaction, and after commit but before acknowledgement. It must also test duplicate client commands, delayed frames, reconnect from an old revision, database unavailability, and deployment during a live Auction. No failure may produce two Sales, lose an accepted Bid, change Auction order, or broadcast state that PostgreSQL did not commit.

Before selecting a paid plan, benchmark PDF generation, XLSX parsing, Hyperdrive transaction latency, database connection limits, Worker CPU, Durable Object memory, and Resend burst behavior. Confirm current prices and service limits directly with each provider at procurement time.
