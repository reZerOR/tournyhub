# 29: Implement and rehearse backup recovery

**What to build:** Give the beta operator a repeatable way to back up and verify Auction data outside the production Supabase project.

**Blocked by:** 28, Prepare deployment and operational diagnostics.

**Status:** ready-for-agent

- [ ] The operator can create an encrypted logical PostgreSQL backup before and after each real Auction, before risky migrations, and on demand.
- [ ] Each backup records its UTC time, source environment, schema and application version, tool version, size, SHA-256 checksum, and encrypted destination.
- [ ] The backup process refuses to overwrite an existing artifact and never prints database credentials or protected row content.
- [ ] Supabase Storage objects use a separate manifest and copy with count and checksum verification.
- [ ] The restore process targets a new non-production project by default and requires explicit high-risk handling for any production replacement.
- [ ] Recovery verification checks migrations, constraints, critical row counts and relationships, representative access, Results, Audit History, and Storage objects.
- [ ] A recorded rehearsal restores a production-shaped synthetic Auction into a separate environment and records elapsed time, recovery point, verification result, and missing data.
- [ ] An interactive setup wizard guides the operator through provider dashboard and credential steps that cannot be automated without echoing secret values.
- [ ] Automated tests cover destination validation, metadata generation, overwrite refusal, checksum failure, incomplete Storage copies, and isolated restore configuration.
