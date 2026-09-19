# 26: Finish responsive and accessible application flows

**What to build:** Make identity, dashboard, setup, Results, feedback, and administration usable with a keyboard, assistive technology, and common screen sizes.

**Blocked by:** 03, Add Google sign-in and account controls; 22, Publish Results and privacy-filtered exports; 23, Copy, archive, restore, and delete Auctions; 24, Collect authenticated beta feedback; 25, Moderate Users and Auctions.

**Status:** ready-for-agent

- [ ] Sign-in, account, dashboard, every setup step, Results, feedback, and administration adapt to representative phone, tablet, laptop, and wide desktop widths without hiding essential actions.
- [ ] Every essential flow works by keyboard with visible focus, logical tab order, and restored focus after dialogs, menus, errors, and navigation.
- [ ] Forms expose labels, descriptions, field errors, grouped Readiness errors, and save status through accessible semantics.
- [ ] Color is never the only way to identify a Team, lifecycle, validation result, destructive action, or completion state.
- [ ] Light and dark appearances preserve readable contrast, and Team colors remain identifiers rather than action or status colors.
- [ ] Loading, empty, permission-denied, not-found, failed-save, and retry states give the User a clear next action.
- [ ] Tables provide useful narrow-screen alternatives without losing sorting, filtering, or access to explicit details.
- [ ] Automated accessibility checks have no critical violations, and browser tests cover the full keyboard path for each essential non-live flow.
