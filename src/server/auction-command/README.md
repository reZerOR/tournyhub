# Auction Command

This is the primary domain and testing seam for fairness-affecting Auction
commands. Later tickets will add its authenticated PostgreSQL transaction
boundary.

Draft Setup mutations live here too, because they edit authoritative records:
`player-entries.ts` owns manual Player Entry and Custom Player Field edits, and
`player-import.ts` owns the all-or-nothing, idempotent Player import commit.
`lock-draft-auction.ts` is the shared Draft lock every Setup command takes
first, so concurrent writes for one Auction cannot race their caps or
uniqueness rules.
