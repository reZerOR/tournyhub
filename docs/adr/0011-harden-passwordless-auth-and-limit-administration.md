# Harden passwordless authentication and limit administration

TournyHub uses database-backed authentication rate limits, hashed email OTPs, verified same-email Google linking, secure cookies, CSRF and origin checks, and separate secrets per environment. Platform Administrators may suspend Users, revoke sessions, and perform read-only lookup but cannot delete accounts, impersonate Users, set passwords, or edit Auction data. Sensitive account and administration actions require recent authentication.
