# Commit Bids in PostgreSQL before acknowledgement or broadcast

Each Bid is accepted or rejected inside one authoritative PostgreSQL transaction that locks and validates the affected Auction and Team state. The Next.js endpoint acknowledges the Bid only after that transaction commits, and Supabase Realtime broadcasts only the committed result. Realtime delivery order, browser clocks, TanStack Query, and Zustand never decide the winner.
