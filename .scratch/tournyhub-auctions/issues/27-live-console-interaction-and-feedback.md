# 27: Finish live console interaction and feedback

**What to build:** Make the Organizer and representative live consoles fast, clear, accessible, and safe to operate under pressure.

**Blocked by:** 03, Add Google sign-in and account controls; 19, Resolve minimums and complete the Auction; 21, Apply controlled paused changes.

**Status:** resolved

- [x] Both live consoles adapt to phone and desktop layouts while keeping the Active Player, current price, close state, connection health, and primary action visible.
- [x] Prices, Budgets, timers, revisions, and counts use tabular numerals and stable layouts.
- [x] The Bid button shows the exact next price, needs one action, has no confirmation dialog, and exposes pending, accepted, rejected, stale, and disabled states.
- [x] Organizer keyboard shortcuts cover pause, resume, begin or cancel close, mark Unsold, and next-Player selection.
- [x] Shortcuts never activate while an input, text area, selection control, dialog text field, or editable element has focus.
- [x] Live sounds begin muted, require User opt-in, respect saved preference, and provide no information unavailable visually.
- [x] Motion is restrained and interruptible, and reduced-motion preference removes or shortens nonessential transitions.
- [x] Accessible live regions announce material Bid, close, pause, Sale, Unsold, and correction changes without announcing each timer tick.
- [x] Browser tests cover keyboard-only Organizer operation, representative bidding, sound preferences, reduced motion, focus, reconnect, and small-screen use.

## Comments

Implemented in `src/features/auctions/live/live-feedback.ts` and the live
console, with the sound preference read from the User on the live page.

- **Keyboard controls.** `P` pauses or resumes, `C` begins or cancels the Manual
  Close warning, `N` offers a random Player, and `U` returns the unbid Player
  using the reason field. The published list is rendered on the console, and a
  shortcut is ignored entirely when the event targets an input, a text area, a
  selection control, a `contenteditable` element, or an open dialog, so typing a
  reason can never pause the Auction.
- **One live region.** `describeLiveChange` compares the previous committed
  snapshot with the next and returns a sentence only for a material change: a
  pause or resume, a Sale, a close warning, a leader change, a new Active Player,
  or an Unsold result. A poll that returns the same revision returns null, and a
  countdown tick is not a snapshot change at all, so the timer no longer
  announces every frame.
- **Opt-in sound.** Sounds start muted, follow the saved `soundEnabled`
  preference, and are toggled from the console itself. A cue is one short
  oscillator tone that repeats what the console already shows: a Sale, a close
  warning, a new leader, or an Unsold result. Nothing is conveyed by sound alone.
- **Under pressure.** The Bid button keeps showing the exact next price with no
  confirmation step, prices, budgets, timers, and counts use tabular numerals,
  and the representative's Active Player card and Bid action stay visible at a
  375-pixel width.

Verification: `pnpm test:unit` (`tests/unit/live-feedback.test.ts`: the
editable-target guard including dialogs and non-elements, modifier and
non-letter rejection, every announced change, silence on an unchanged poll, and
the sound-cue mapping) and `pnpm test:browser`
(`tests/browser/live-console.spec.ts`: offering a Player, pausing, resuming, and
starting a close entirely by keyboard with each change announced, the countdown
carrying no live region, the typing guard holding through a filled reason field,
the sound switch starting unchecked and persisting across a reload, and a
phone-sized representative console keeping the Bid action visible).
