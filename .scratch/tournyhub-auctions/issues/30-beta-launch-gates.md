# 30: Pass the beta launch gates

**What to build:** Prove that the completed application is safe and fast enough for the first real, private Auction under the accepted free-tier limits.

**Blocked by:** 26, Finish responsive and accessible application flows; 27, Finish live console interaction and feedback; 29, Implement and rehearse backup recovery.

**Status:** ready-for-agent

- [ ] Formatting, linting, static types, unit, property, database integration, route, browser, and accessibility suites pass from a clean checkout.
- [ ] Repeated concurrency tests pass for equal-price Bids, Bid versus finalizer, duplicate finalizers, pause versus Bid, representative replacement, response-loss retry, revision gaps, and competing corrections.
- [ ] Authorization tests prove that unrelated Users, former representatives, suspended Users, and hidden-Auction callers cannot read, subscribe, export, or mutate protected data.
- [ ] Privacy checks find no phone numbers in PDFs, participant-wide Realtime messages, unauthorized snapshots, feedback, URLs, or platform logs.
- [ ] A production-like test runs one Live Auction with 16 Teams normally, 32 Teams at the boundary, up to 2,000 setup Players, and 40 connected browser tabs or equivalent clients.
- [ ] Bid response time measured from server receipt through committed response has p95 below 750 milliseconds at 40 connected tabs, with a target below 500 milliseconds.
- [ ] Reconnect bursts, snapshot size, database lock waits, query duration, connection usage, Realtime lag, provider quotas, and error rates remain within the documented beta limits.
- [ ] Current and previous major Chrome, Edge, Firefox, and Safari versions pass the essential Organizer and representative flows.
- [ ] No unresolved critical or high-severity integrity, authorization, privacy, or data-loss defect remains.
- [ ] Production secrets differ from development and Preview values, remain absent from source and client bundles, and pass rotation checks.
- [ ] Backup restoration succeeds in a separate environment, and the operator completes the first-event checklist and practice Auction with representative accounts.
- [ ] The beta displays or documents its one-Live-Auction limit, 16-Team recommendation, 32-Team maximum, 40-tab cap, non-commercial restriction, and lack of an SLA.
