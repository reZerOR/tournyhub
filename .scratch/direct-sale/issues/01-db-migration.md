# 01 — DB migration: add `direct` to `sale_source`

Status: resolved
Type: backend

## Goal

The `sale` table's `source` column currently allows `'bid'` and `'forced'`. Add `'direct'` to the check constraint so the new Direct Sale command can insert rows with that source.

## Steps

1. Create `supabase/migrations/<timestamp>_direct_sale.sql` with:
   ```sql
   alter table "sale"
     drop constraint if exists "sale_source_check";

   alter table "sale"
     add constraint "sale_source_check"
       check ("source" in ('bid', 'forced', 'direct'));
   ```
   Use a timestamp one second after the latest existing migration (`20260922130000`), e.g. `20260922130001_direct_sale.sql`.

2. Verify the constraint name against the actual DB schema before dropping — use `\d sale` or inspect the migration that created the table.

## Done when

Migration file exists and would apply cleanly against the local DB.
