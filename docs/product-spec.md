# TournyHub first-version product specification

Status: Confirmed

## Product boundary

TournyHub runs live player Auctions. Tournament fixtures, standings, scores, public Auction discovery, read-only Viewers, native applications, offline use, push notifications, commercial events, and account deletion are outside the first version.

The beta is an unadvertised, non-commercial website with open registration. Registration does not grant access to another User's Auction. An Auction is available only to its Organizer, assigned Team Representatives, and Platform Administrators performing a recorded moderation action.

## People and authority

- Any registered User may create and organize Auctions.
- An Auction has exactly one Organizer at a time. The Organizer cannot represent a Team in that Auction.
- Each Team has exactly one Team Representative. A User may represent no more than one Team in an Auction.
- A Player Representative is both a Player already assigned to the represented Team and the logged-in Team Representative. They count toward total and Tier Roster limits and do not enter bidding.
- An Outside Representative operates a Team but does not occupy a Roster position.
- A Platform Administrator may suspend Users, revoke sessions, hide Auctions, and inspect moderation records. They cannot edit Auction data or outcomes.

Canonical definitions live in [the domain glossary](../CONTEXT.md).

## Account access

Users sign in through email OTP or Google. Passwords are not supported. New registrations are open, and targeted Team invitations may lead a new User through registration. A User sees Auctions they organize, Teams they represent, pending invitations, and archived Auctions.

Account settings include display name, read-only verified email, active sessions, sign-out controls, and Google-link status. Appearance is permanently dark, while live sound is controlled from the Live Auction console. Account deletion is deferred.

## Creating an Auction

The default setup order is:

1. Enter the required Auction title and Game name, then choose Simple or Tiered Rules and Manual or Timed Close.
2. Add Player Entries manually or import CSV or XLSX.
3. Create Teams manually or use Calculate Teams. The calculator asks for minimum and maximum Roster sizes, presents every feasible Team count, and saves those values for the later Rules step.
4. Choose a Player Representative or invite an Outside Representative for each Team.
5. Configure the shared Budget, Bid Increment, Roster Rules, Tiers, Tier limits, Starting Prices, and timer when applicable.
6. Resolve every Readiness error and start the Auction.

Setup autosaves and shows Saving, Saved, or Failed to save. The Organizer may visit sections in another order. Later Tier Rules may make an existing Team plan infeasible; this blocks Readiness but never silently deletes Teams or invalidates accepted invitations.

## Players and imports

A Player Entry belongs to one Auction. Display name is required. Role, External Player ID, phone number, custom fields, Tier, Starting Price override, and representative link are optional when the Rule mode permits them. Player photos are not supported.

External Player IDs represent game UIDs or another Organizer-defined identifier and must be unique within the Auction. Duplicate display names are allowed with a warning.

CSV and XLSX imports support worksheet selection, arbitrary column mapping, Custom Player Fields, normalized preview, and downloadable errors. Import is all-or-nothing after blocking errors are resolved. The Auction supports at most 2,000 Player Entries.

Phone numbers are visible to all Team Representatives while the Auction is Live or Paused. After completion, representatives see phone numbers only for Players on their own Roster. Phone numbers remain out of default tables and the Active Player card and appear in an explicit details panel.

## Teams and planning

An Auction supports up to 32 Teams, with 16 recommended for the free beta. Team names are unique within the Auction; logo and color are optional. Every Team begins with the same Budget and follows the same total and Tier constraints.

Calculate Teams uses Player count, preassigned Player Representatives, minimum and maximum Roster sizes, and available Tier constraints. It shows all feasible counts and a recommendation; the Organizer chooses. Generated Teams begin unnamed and without a representative.

Invitations target one email, are single-use, and require the exact invited verified email. Issuing a newer invitation immediately invalidates older invitations for that Team. The Organizer may replace a representative while the Auction is Draft, Ready, or Paused.

## Rule modes

Credits are positive whole-number virtual units with no cash value. Bids, prices, increments, and Budgets use whole Credits.

Simple Rules provide:

- Equal starting Budget
- Minimum and maximum total Roster size
- One default Starting Price with optional Player overrides
- One fixed Bid Increment

Tiered Rules add:

- Ordered, Organizer-defined Tiers
- Exactly one Tier for every Player
- Default Starting Price per Tier with optional Player overrides
- Shared minimum and maximum Player counts for every Team in each Tier
- A fixed Tier order, with one Active Tier at a time

Each next Bid is exactly the current price plus the fixed increment. The first Bid equals the Player's Starting Price. An unsold Player keeps the same Starting Price on every later offering.

## Readiness and feasibility

An Auction becomes Ready only when:

- It has at least two uniquely named Teams.
- Every Team has an accepted Team Representative.
- Budgets and constraints are equal across Teams.
- Required Player data and Tier assignments are present.
- External Player IDs are unique.
- Prices, Budget, and Bid Increment are valid positive whole numbers.
- Available Players can satisfy every Team's minimums.
- At least one Legal Completion exists.

Readiness errors are grouped by Teams, Players, Rules, Tiers, invitations, and feasibility and link to the affected record. Representatives do not need to approve the start. The Organizer may start while a representative is disconnected after acknowledging a warning.

## Live Auction flow

Only one Player is active at a time. Within the Active Tier, the Organizer may choose the next Player or use Random Selection. A randomly selected Player is immediately visible and cannot be redrawn without returning them to the queue with a recorded reason.

A Team Representative sees the Active Player, current price, leading Team, close state, exact next-price Bid button, remaining Budget, legal spending reserve, Roster capacity, Tier capacity, connection status, and Bid acknowledgement state.

A submitted Bid is not shown as accepted until PostgreSQL commits it. The first valid request received by the server wins a simultaneous price. A Team cannot bid after reaching a total or Tier maximum. A Bid is also invalid if winning would leave insufficient Credits or remaining Players for the Team's cheapest Legal Completion.

Rejected Bids remain private to the Organizer and submitting representative. Accepted Bids for the Active Player are visible to every Auction participant.

## Closing modes

Manual Close begins when the Organizer starts a three-second closing warning. A valid Bid during the warning returns bidding to Open. The Organizer may cancel the warning without changing the current leader.

Timed Close uses one Organizer-configured duration, defaulting to 30 seconds. A valid Bid during the final five seconds resets the remaining time to five seconds. PostgreSQL time and the stored deadline decide whether a Bid arrived in time.

When the displayed timer reaches zero, clients disable bidding and show Finalizing until the committed result arrives. Pausing stores the remaining duration; resuming creates a new database deadline from that duration.

No valid Bid produces an automatic Unsold result for that offering. Before the first Bid, the Organizer may return an Active Player to the queue. After a Bid, deferral requires cancelling all Bids for that presentation and retaining them as cancelled history.

## Tier progression and unsold Players

A Tier finishes after every available Player in it has been offered once. The Organizer may then activate the next Tier or start an Unsold Round containing Players from any completed Tier.

There is no retry limit for an unsold Player. The Organizer may reoffer them at the unchanged Starting Price. Once every Team satisfies its minimum requirements, the Organizer may close the Unsold Pool and mark remaining Players Final Unsold.

If an unsold Player and a single deficient eligible Team remain, closing the Unsold Round creates a Forced Assignment at the Starting Price. With several remaining Players and deficient Teams, the Organizer may run another Unsold Round or request random matching. Random matching chooses only among complete assignments that preserve Legal Completion. The Organizer cannot manually select individual pairings.

## Corrections and changes

The Organizer may pause at any time. Pause freezes closing, rejects new Bids, and preserves the Active Player, price, and leader.

While paused, the Organizer may:

- Cancel the current highest Bid and restore the previous valid Bid or Starting Price
- Reverse a Sale, refund its Team, and return the Player to the Unsold Pool
- Replace a Team Representative
- Add Players only to unopened Tiers
- Increase every Team's Budget equally
- Change Rules that preserve completed Sales and Legal Completion
- Transfer ownership to an eligible registered User

Starting Prices do not change after bidding begins. Budgets cannot decrease or change unequally. Sold Players cannot move between Tiers, maximums cannot fall below current counts, and completed Sale records change only through Sale Reversal. Every fairness-affecting action records an immutable Audit Entry and announces the change to participants.

## Completion, cancellation, copying, and deletion

The Organizer explicitly completes an Auction after all Tiers are resolved, every Team satisfies minimum total and Tier requirements, no Player is active, and any remaining Unsold Pool has been closed. A Completed Auction is read-only.

The Organizer may cancel a Live Auction only while paused. A Cancelled Auction remains read-only and cannot reopen. Either kind may be copied into a new Draft.

An Auction Copy carries Rules, Custom Player Field definitions, and selected Player Entries. Copied entries retain names, roles, External Player IDs, phone numbers, and custom values. The Organizer chooses whether to retain Tiers and prices or assign them again. User links, Team invitations, Bids, Sales, and results never copy.

Archiving hides an Auction for seven days, after which permanent deletion occurs without a reminder email. Restoration is available during the seven-day window.

## Results and exports

Completed results are available to the Organizer and Team Representatives. They show every Team's Roster, Credits spent and remaining, Tier counts, sale prices, Forced Assignments, and Final Unsold Players.

The Organizer's Results CSV includes every supplied Player phone number. A Team Representative's Results CSV includes phone numbers only for Players on that Team's Roster. The PDF omits phone numbers for every role. Access by a Platform Administrator requires a moderation reason and Audit Entry.

Results group Players beneath centered Team headings with their Team colors. Excel downloads preserve the colors and centered headings; CSV downloads use plain Team sections. Each Team has a Copy roster action and a PDF download, both without phone numbers. The Organizer can download a Team's Excel or CSV contact roster; a Team Representative can download contact rosters only for their own Team. Team-specific export URLs narrow the server-authorized results and reject unavailable Teams. All downloaded formats record an Audit Entry.

## Interface requirements

The application uses a permanent dark appearance, responsive desktop and mobile layouts, English copy, local-time display, and UTC storage. It uses a neutral sports control-room style with indigo primary actions, green completed states, amber closing warnings, red destructive or rejected states, and Team colors as identifiers only.

Live prices, Budgets, timers, and counts use tabular numerals. Bid submission is one action with no confirmation dialog. The button displays the exact next price, becomes pending during submission, and reports the authoritative result.

Live sounds are opt-in and begin muted. Motion is restrained, interruptible, and disabled or reduced by User preference. No confetti or casino imagery appears.

The Organizer has visible controls and keyboard shortcuts for pause, resume, closing, cancelling close, marking unsold, and choosing the next Player. Shortcuts do not fire while typing.

Connection loss disables bidding and marks state stale. Reconnection fetches an authoritative snapshot. Any missing Auction revision also causes a full snapshot replacement rather than client-side reconstruction.

## Beta constraints

The free beta permits one Live Auction at a time, recommends at most 16 Teams, caps all connected browser tabs at 40, and emits at most two public state fan-outs per second. It targets Bid responses below 500 milliseconds and requires measured p95 below 750 milliseconds before beta use, without an availability or latency SLA.

The beta uses Vercel Hobby, Supabase Free, and Gmail only for personal, non-commercial use. It has no public Viewer, public Auction directory, product analytics, or external error tracker. An authenticated feedback form records page, User, category, and message without attaching secrets, phone numbers, or full Auction data.
