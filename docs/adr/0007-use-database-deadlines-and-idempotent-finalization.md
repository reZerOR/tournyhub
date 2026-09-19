# Use database deadlines and idempotent finalization

PostgreSQL stores each closing deadline and decides whether a Bid arrived in time after locking the Active Player. One idempotent database function finalizes every timed or manual close; browser requests, Auction access, and a five-second Supabase Cron sweep only wake that function. Pause and resume preserve the remaining duration rather than trusting a browser timer or permanent application process.
