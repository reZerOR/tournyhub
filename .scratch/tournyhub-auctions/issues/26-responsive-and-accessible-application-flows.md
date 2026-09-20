# 26: Finish responsive and accessible application flows

**What to build:** Make identity, dashboard, setup, Results, feedback, and administration usable with a keyboard, assistive technology, and common screen sizes.

**Blocked by:** 03, Add Google sign-in and account controls; 22, Publish Results and privacy-filtered exports; 23, Copy, archive, restore, and delete Auctions; 24, Collect authenticated beta feedback; 25, Moderate Users and Auctions.

**Status:** resolved

- [x] Sign-in, account, dashboard, every setup step, Results, feedback, and administration adapt to representative phone, tablet, laptop, and wide desktop widths without hiding essential actions.
- [x] Every essential flow works by keyboard with visible focus, logical tab order, and restored focus after dialogs, menus, errors, and navigation.
- [x] Forms expose labels, descriptions, field errors, grouped Readiness errors, and save status through accessible semantics.
- [x] Color is never the only way to identify a Team, lifecycle, validation result, destructive action, or completion state.
- [x] Light and dark appearances preserve readable contrast, and Team colors remain identifiers rather than action or status colors.
- [x] Loading, empty, permission-denied, not-found, failed-save, and retry states give the User a clear next action.
- [x] Tables provide useful narrow-screen alternatives without losing sorting, filtering, or access to explicit details.
- [x] Automated accessibility checks have no critical violations, and browser tests cover the full keyboard path for each essential non-live flow.

## Comments

Implemented in `src/app/globals.css` (visible keyboard focus, reduced-motion
handling), `src/app/not-found.tsx`, `src/app/app/error.tsx`, and
`src/app/app/loading.tsx`, the shell skip link and responsive spacing in
`src/app/app/layout.tsx`, the scrollable setup navigation, and overflow
containers for the Player and Team tables.

- **Motion.** A `prefers-reduced-motion: reduce` block reduces every animation
  and transition to a single frame and disables smooth scrolling, so a User who
  prefers reduced motion loses nothing they could only learn from movement.
- **Clear next actions.** The not-found boundary explains that a missing record
  and a record the User cannot see are deliberately identical and offers the
  dashboard and sign-in; the error boundary offers Retry and the dashboard and
  shows only a reference id; the loading state announces "Loading…" politely.
- **Keyboard.** A skip link is the first tabbable control and reveals itself on
  focus, focus is always visible through a global `:focus-visible` outline, and
  the setup navigation stays a reachable row on a narrow screen instead of
  collapsing into a hidden menu.
- **Semantics.** Form controls keep their labels, descriptions, and `role="alert"`
  errors; Readiness keeps its grouped errors with links to the affected section;
  save status keeps `aria-live`; tables carry captions and `scope` and now scroll
  rather than breaking the layout.
- **Color independence.** Teams are identified by name, lifecycle by text and a
  badge, readiness by words, and destructive actions by their label; the brand
  swatch remains `aria-hidden`, so no state depends on color alone.

Verification: `pnpm test:browser` (`tests/browser/accessibility.spec.ts`: a
structural audit of sign-in, dashboard, and the Players, Teams, Rules, and
Readiness sections — exactly one level-1 heading, uniquely identified fields,
named interactive elements, captioned tables with scoped headers, `alt`
attributes — plus the skip link being first and revealing on focus, and a
phone-sized run that keeps the New Auction action, the setup navigation, and the
Player form reachable).
