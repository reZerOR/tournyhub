# 06: Import Player Entries from CSV and XLSX

**What to build:** Let the Organizer turn an existing spreadsheet into validated Player Entries without leaving partial data behind.

**Blocked by:** 05, Manage Player Entries and Custom Player Fields.

**Status:** ready-for-agent

- [ ] The Organizer can upload supported CSV and XLSX files within explicit byte, row, worksheet, column, and cell-length limits.
- [ ] XLSX import allows worksheet selection, and both formats allow arbitrary source columns to map to standard and Custom Player Fields.
- [ ] A normalized preview shows accepted values, warnings, blocking errors, and the resulting Player count before commit.
- [ ] The Organizer can download row-specific import errors without exposing unrelated Auction data.
- [ ] Import rejects macros and unsupported structures, treats formulas and links as plain data, and validates claimed file type against content.
- [ ] Commit is all-or-nothing and idempotent, respects the 2,000-Player cap, and cannot create duplicate External Player IDs.
- [ ] Tests cover reordered columns, alternate worksheets, optional phone numbers, custom fields, malformed files, formula prefixes, duplicate submission, and transaction rollback.
