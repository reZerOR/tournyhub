# Route fairness-affecting changes through one Auction Command module

Pages and interface modules submit fairness-affecting commands through one Auction Command interface. Its PostgreSQL implementation owns authorization, row locking, idempotency, rule validation, Audit Entries, revisions, and committed events. TypeScript may preview and explain Rules but cannot define a competing path for accepting Bids or changing Auction state.
