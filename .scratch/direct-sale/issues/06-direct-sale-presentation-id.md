# 06 — Verify Direct Sale end to end, and fix the test gap

Status: ready-for-agent
Type: backend

## Correction (2026-09-30)

This ticket was filed from four production runtime errors of
`null value in column "presentation_id" of relation "sale" violates not-null
constraint` on `/app/auctions/[id]/live`, read as "the schema still forbids a Sale
without a Presentation, so the command always throws". That reading was **wrong**.
Checked against production:

- `sale.presentation_id` is **already nullable** — `information_schema.columns`
  reports `is_nullable = YES`.
- `supabase_migrations.schema_migrations` contains version `20260922130002`
  (`direct_sale_nullable_presentation`), which drops `NOT NULL` on both
  `sale.presentation_id` and `unsold_membership.presentation_id`. **Option A is
  what shipped**, which is what this ticket would have recommended anyway.
- `sale_presentation_id_key` is a plain UNIQUE index, which admits many NULLs, so
  repeated Direct Sales are permitted.

So the schema change this ticket proposed is already applied. What is unexplained
is the timing: the errors are timestamped 2026-09-23T19:27–19:32 while the
migration file is dated 2026-09-22, so production had most likely not been
migrated when that deployment ran. Confirm that before closing.

## The real gap

```sql
select count(*) from "sale" where "source" = 'direct';
```

returns **0** — no Direct Sale has ever succeeded, successfully or otherwise, and
nothing in the test suite executes the insert against a real schema. That is what
this ticket now covers.

## Housekeeping

Tickets 01–05 in this feature do not reflect the repository: 01 is `resolved`, but 02, 03 and 05 are still `ready-for-agent` although `directSale`, `directSaleAction` and the console wiring are all present in the code (`git log` shows "fix(live-auction): complete Direct Assignment type safety and tests"). Mark them resolved once this ticket's test passes, or correct their status if the work is genuinely incomplete.

## Done when

A database test performs a Direct Sale end to end and asserts a `sale` row with
`source = 'direct'` and a NULL `presentation_id`, the Team Roster and Budget
changed, and a Revision and an Audit Entry written. Acceptance criteria 2–10 in
`spec.md` pass against it.
