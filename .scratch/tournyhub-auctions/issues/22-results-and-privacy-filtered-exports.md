# 22: Publish Results and privacy-filtered exports

**What to build:** Give authorized participants useful final Auction Results while limiting Player phone numbers to the people who need them.

**Blocked by:** 19, Resolve minimums and complete the Auction; 21, Apply controlled paused changes.

**Status:** ready-for-agent

- [ ] Completed Results show every Team's Roster, Credits spent and remaining, Tier counts, sale prices, Forced Assignments, and Final Unsold Players.
- [ ] The Organizer and Team Representatives can open Results for their Auction, while unrelated Users receive no protected data.
- [ ] While the Auction is Live or Paused, a representative can open explicit Player details containing supplied phone numbers, but phone numbers remain absent from default tables and the Active Player card.
- [ ] After completion or cancellation, a representative can view phone numbers only for Players on that Team's Roster.
- [ ] The Organizer's Results CSV includes every supplied Player phone number and the representative CSV includes phone numbers only for that Team's Roster.
- [ ] CSV generation escapes User-controlled cells that could be interpreted as spreadsheet formulas.
- [ ] Every Results PDF excludes phone numbers regardless of the requesting role.
- [ ] Export authorization and phone-number exposure are recorded without placing phone numbers in Audit details or logs.
- [ ] Tests compare page, snapshot, CSV, PDF, Realtime, and log content across Organizer, representative, administrator, and unrelated User roles.
