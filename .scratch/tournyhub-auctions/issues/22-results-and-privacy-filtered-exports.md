# 22: Publish Results and privacy-filtered exports

**What to build:** Give authorized participants useful final Auction Results while limiting Player phone numbers to the people who need them.

**Blocked by:** 19, Resolve minimums and complete the Auction; 21, Apply controlled paused changes.

**Status:** resolved

- [x] Completed Results show every Team's Roster, Credits spent and remaining, Tier counts, sale prices, Forced Assignments, and Final Unsold Players.
- [x] The Organizer and Team Representatives can open Results for their Auction, while unrelated Users receive no protected data.
- [x] While the Auction is Live or Paused, a representative can open explicit Player details containing supplied phone numbers, but phone numbers remain absent from default tables and the Active Player card.
- [x] After completion or cancellation, a representative can view phone numbers only for Players on that Team's Roster.
- [x] The Organizer's Results CSV includes every supplied Player phone number and the representative CSV includes phone numbers only for that Team's Roster.
- [x] CSV generation escapes User-controlled cells that could be interpreted as spreadsheet formulas.
- [x] Every Results PDF excludes phone numbers regardless of the requesting role.
- [x] Export authorization and phone-number exposure are recorded without placing phone numbers in Audit details or logs.
- [x] Tests compare page, snapshot, CSV, PDF, Realtime, and log content across Organizer, representative, administrator, and unrelated User roles.

## Comments

Implemented in `src/domain/results.ts` (the phone-number policy, CSV
escaping, and export naming), `src/server/auction-query/results.ts`
(`getResultsForCaller`), `src/server/import-export/results-export.ts` plus a new
dependency-free `pdf-writer.ts`, the export route at
`/app/auctions/[id]/results/export/[format]`, and the Results page at
`/app/auctions/[id]/results`.

- **One policy.** `canViewPhoneNumbers` is the only place that decides phone
  visibility, and the read model filters with it before the payload is built.
  An unauthorized number is therefore absent from the JSON, the CSV, and the
  PDF alike — not merely hidden by the UI. The Organizer always sees supplied
  numbers; a Team Representative sees every number while the Auction is Live or
  Paused, and afterwards only for Players on its own Roster.
- **Roster membership comes from Sales.** A committed Sale does not write back
  to `player_entry.team_id`, so Roster membership is derived from both the
  Player Representative preassignment and the unreversed Sales. Reading only
  `team_id` would withhold a Representative's own acquired Players and leak the
  wrong Team's contacts.
- **Explicit details.** Phone numbers appear only inside a `<details>` section
  headed "Player details", never in the default Team tables, and the live
  snapshot still carries no phone number at all, so the Active Player card and
  participant-wide Realtime payloads stay clean.
- **Exports.** The Organizer CSV is built from every Player Entry, so a Player
  who was never assigned is still present with its supplied number; a
  Representative CSV is built from its own Roster alone. Both neutralize a
  leading `=`, `+`, `-`, or `@` before quoting, so a Player name cannot execute
  in a spreadsheet. The PDF is generated from Rosters, prices, and sources only
  and never receives a phone number.
- **Auditing.** Each export writes an immutable `export_results` Audit Entry
  naming the format, the caller's role, the row count, and the number of
  exposed phone numbers — never a value.

Verification: `pnpm test:unit` (`tests/unit/results.test.ts`,
`tests/unit/results-export.test.ts`: lifecycle-aware policy, formula-prefix
neutralization, a parseable paginated PDF, an Organizer CSV containing
unassigned Players' numbers, a Representative CSV scoped to its Roster, and a
PDF that never contains a phone number) and `pnpm test:db`
(`tests/database/results-export.test.ts`: unrelated and Draft denial, every
number visible while Live, withheld numbers absent from a closed Representative
payload and its Team rows, an Organizer still seeing everything after closing,
role-scoped CSV contents, and an export Audit Entry whose details contain no
phone number), plus `pnpm test:browser`
(`tests/browser/results-export.spec.ts`: Results and both exports for the
Organizer, the narrowed Representative view with a `Hidden` cell, and 404s for
an unrelated User).
