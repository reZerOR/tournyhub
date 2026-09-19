# Broker short-lived private Realtime tokens

Next.js exchanges a valid Better Auth session and Auction membership for a short-lived Supabase-compatible JWT scoped to one Auction. Supabase Realtime uses private channels and row-level policies with receive-only browser access, while sensitive commands remain authenticated HTTP requests. The browser never receives database credentials, signing keys, or a Supabase service credential.
