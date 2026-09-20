# 06: Import Player Entries from CSV and XLSX

**What to build:** Let the Organizer turn an existing spreadsheet into validated Player Entries without leaving partial data behind.

**Blocked by:** 05, Manage Player Entries and Custom Player Fields.

**Status:** resolved

- [x] The Organizer can upload supported CSV and XLSX files within explicit byte, row, worksheet, column, and cell-length limits.
- [x] XLSX import allows worksheet selection, and both formats allow arbitrary source columns to map to standard and Custom Player Fields.
- [x] A normalized preview shows accepted values, warnings, blocking errors, and the resulting Player count before commit.
- [x] The Organizer can download row-specific import errors without exposing unrelated Auction data.
- [x] Import rejects macros and unsupported structures, treats formulas and links as plain data, and validates claimed file type against content.
- [x] Commit is all-or-nothing and idempotent, respects the 2,000-Player cap, and cannot create duplicate External Player IDs.
- [x] Tests cover reordered columns, alternate worksheets, optional phone numbers, custom fields, malformed files, formula prefixes, duplicate submission, and transaction rollback.

## Comments

Implemented on top of ticket 05. Per `docs/architecture.md`, **Import and
Export** owns validation and preview only; the authoritative write lives in the
Auction Command module.

- `src/domain/player-import.ts` holds the limits, header-to-field suggestions,
  mapping validation, row normalization, and the error CSV. It is pure, so the
  browser preview and the server commit run the same rules.
- `src/server/import-export/player-import-file.ts` reads an upload into plain
  string worksheets and `.../player-import.ts` builds the authorized preview.
- `src/server/auction-command/player-import.ts` commits: it locks the Draft
  Auction, returns the stored result for a repeated command ID, normalizes,
  checks the 2,000-entry cap and External Player ID uniqueness, then inserts
  every row and its custom values in one transaction.
- `src/features/auctions/setup/player-import*.{ts,tsx}` are the server actions
  and the Players-setup card; the error download is built in the browser from
  the Organizer's own upload.
- `supabase/migrations/20260920180000_player_import.sql` records each committed
  command ID per Auction for idempotency. `lock-draft-auction.ts` is the shared
  Draft lock, now used by both Setup commands.

Limits are 5 MB, 10,000 rows, 20 worksheets, 100 columns, and 1,000 characters
per cell. The file's name claims its type and its bytes must agree: a CSV must
be UTF-8 text, an XLSX must be a zip, and a workbook whose zip entry table
names a VBA project is refused, so a renamed file cannot pick a different
parser or slip a macro through. Formulas, links, and formula-prefixed cells are
only ever their stored text. Workbook reads are bounded with `sheetRows` so a
small file cannot expand into a huge worksheet.

Verification: `pnpm check` passes end to end — format, lint, typecheck, env,
50 unit tests, 61 database tests (12 new), build, and 17 browser tests (3 new).
The browser suite also needed a pre-existing fix: `tests/browser/players.spec.ts`
filled the next Player Entry before the add form's post-save reset landed, so
the reset wiped it. It now waits for the reset; that test failed identically on
the pre-change tree.

Not covered here: rate-limiting imports. `docs/security-and-permissions.md`
lists imports among the actions to rate-limit, and
`docs/implementation-plan.md` places abuse limits in Slice 10 (hardening and
beta launch), so no limiter is introduced in this slice.
