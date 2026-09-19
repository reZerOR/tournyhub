# 27: Finish live console interaction and feedback

**What to build:** Make the Organizer and representative live consoles fast, clear, accessible, and safe to operate under pressure.

**Blocked by:** 03, Add Google sign-in and account controls; 19, Resolve minimums and complete the Auction; 21, Apply controlled paused changes.

**Status:** ready-for-agent

- [ ] Both live consoles adapt to phone and desktop layouts while keeping the Active Player, current price, close state, connection health, and primary action visible.
- [ ] Prices, Budgets, timers, revisions, and counts use tabular numerals and stable layouts.
- [ ] The Bid button shows the exact next price, needs one action, has no confirmation dialog, and exposes pending, accepted, rejected, stale, and disabled states.
- [ ] Organizer keyboard shortcuts cover pause, resume, begin or cancel close, mark Unsold, and next-Player selection.
- [ ] Shortcuts never activate while an input, text area, selection control, dialog text field, or editable element has focus.
- [ ] Live sounds begin muted, require User opt-in, respect saved preference, and provide no information unavailable visually.
- [ ] Motion is restrained and interruptible, and reduced-motion preference removes or shortens nonessential transitions.
- [ ] Accessible live regions announce material Bid, close, pause, Sale, Unsold, and correction changes without announcing each timer tick.
- [ ] Browser tests cover keyboard-only Organizer operation, representative bidding, sound preferences, reduced motion, focus, reconnect, and small-screen use.
