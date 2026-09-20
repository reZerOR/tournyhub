## Agent skills

### Issue tracker

When publishing or reading issues and specifications, use the local Markdown tracker under `.scratch/`. Read `docs/agents/issue-tracker.md` for its layout.

### Triage labels

When assigning issue status, use the default five-role triage vocabulary in `docs/agents/triage-labels.md`.

### Domain docs

Before changing Auction behavior, terminology, architecture, security, or persistence, read the relevant single-context domain documents described in `docs/agents/domain.md`.

### Environment files

Never create or edit `.env`, `.env.local`, `.env.*.local`, or any other real environment file — they hold live secrets and are gitignored on purpose. The only environment file an agent may write is `.env.example`, kept as placeholders. If a task needs a new variable, add it to `.env.example` and to `src/config/environment.ts`'s schema, and tell the person running the agent to set the real value themselves.

### Local Supabase runs under WSL Docker

The local Supabase stack (`pnpm db:start` / `supabase db start`) runs via Docker inside WSL on this machine, not Docker Desktop on the Windows host directly. A plain Windows shell (including this agent's default Bash tool) will not see the `docker` or `supabase` CLI as healthy even though the containers are up — check with `Get-NetTCPConnection -LocalPort 54321,54322,54323` (ports respond) rather than trusting a `docker`/`supabase status` command that reports "not found". After editing `.env.local`, the running `pnpm dev` process must be restarted — it caches the database pool and parsed env at process start and will not pick up the change on its own.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
