# 01: Bootstrap the application and quality loop

**What to build:** Create the runnable TournyHub application foundation so a contributor can start it, validate it, and run every test category from a clean checkout.

**Blocked by:** None, can start immediately.

**Status:** ready-for-agent

- [ ] A clean checkout installs with the project's documented runtime and package manager and starts the Next.js TypeScript application locally.
- [ ] The application uses the selected shadcn Base UI Nova preset and shared light and dark design tokens without hand-copied registry code.
- [ ] Environment validation fails at startup with safe, actionable messages when required values are absent and never prints secret values.
- [ ] Local database tooling can apply a versioned baseline migration to an empty development database and report migration status.
- [ ] Formatting, linting, static types, unit tests, database integration tests, and browser tests have runnable package commands.
- [ ] Continuous integration runs the same validation commands from a clean environment and passes with the foundation application.
- [ ] The source layout keeps identity, Auction setup, Auction commands, queries, Realtime, imports/exports, and administration in recognizable modules.
