# TournyHub documentation

These documents define the first-version product and its implementation constraints.

- [Product specification](product-spec.md): product behavior, scope, and accepted user flows
- [Domain glossary](../CONTEXT.md): canonical Auction language
- [Architecture](architecture.md): deployment shape, modules, and provider seams
- [Database and commands](database-and-commands.md): proposed records, invariants, and authoritative commands
- [Security and permissions](security-and-permissions.md): access matrix and authentication controls
- [Test and launch plan](test-and-launch-plan.md): verification and beta gates
- [Deployment and backup runbook](deployment-and-backup-runbook.md): external setup and operations
- [Implementation plan](implementation-plan.md): ordered vertical slices with completion criteria
- [ADR index](adr/README.md): hard-to-reverse decisions and their reasons
- [Architecture research](research/free-tier-architecture.md): current free-tier facts, limits, and migration path

The product specification is the source of truth for behavior. `CONTEXT.md` is the source of truth for vocabulary. ADRs explain costly decisions but do not replace either document.
