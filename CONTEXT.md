# TournyHub Auctions

TournyHub Auctions runs live player auctions in which team representatives spend virtual credits to assemble team rosters.

## Language

**Auction**:
A titled live event in which Teams bid Credits to acquire Players. An Auction uses either Simple Rules or Tiered Rules and names the Game for which the Teams are being assembled.
_Avoid_: Bidding room, bidding tournament

**Draft Auction**:
An Auction whose setup remains editable and whose bidding has not started.

**Ready Auction**:
A Draft Auction whose Teams, Players, Rules, and assignments pass every start requirement. The Organizer may start it without approval from Team Representatives.

**Live Auction**:
An Auction in which bidding has started and which is not currently paused.

**Completed Auction**:
An Auction whose bidding has finished and whose final results are read-only.

**Cancelled Auction**:
An Auction ended without completion. It remains read-only and cannot return to a live state.

**Archived Auction**:
An Auction hidden from normal lists and retained for recovery for seven days before permanent deletion.

**Game**:
The sport or game named by the Organizer for an Auction. TournyHub does not restrict Auctions to a predefined list of Games.
_Avoid_: Sport type, tournament type

**User**:
A person with a TournyHub account and display name who signs in through an email one-time code or Google. A User may hold different roles in different Auctions.
_Avoid_: Account, Player

**Platform Administrator**:
A platform-level operator who may suspend abusive Users or hide an Auction. A Platform Administrator cannot alter Auction Bids, Teams, Rules, or results.
_Avoid_: Organizer, super Organizer

**Organizer**:
A User who creates and controls an Auction. Each Auction has one Organizer, who cannot manage a Team in the same Auction.
_Avoid_: Host, auction admin

**Ownership Transfer**:
The replacement of an Auction's Organizer with another User who does not represent a Team in that Auction. It may occur while the Auction is a Draft, Ready, or Paused Auction.
_Avoid_: Co-hosting

**Team Representative**:
A User authorized to operate the bidding controls for one Team in an Auction. The Team owns the resulting Bids and Player acquisitions.
_Avoid_: Team Leader, Team Manager, bidder

**Player**:
A person who may be offered for acquisition during an Auction. A Player needs a display name but does not need a TournyHub account or need to attend the Auction.
_Avoid_: User, bidder

**Player Entry**:
The Auction-specific information used to represent a Player. It has a required display name and may contain an External Player ID, phone number, role, Tier, Starting Price override, and custom fields. Providing a phone number makes it visible to Team Representatives while the Auction is live or paused.
_Avoid_: Global player profile

**External Player ID**:
An optional identifier assigned to a Player by a game or outside organization, such as a game UID. Its meaning is supplied by the Organizer, and its value must be unique within the Auction when present.
_Avoid_: Identification number, government ID

**Custom Player Field**:
An optional game-specific fact defined by the Organizer and stored on Player Entries in one Auction.
_Avoid_: Global player attribute

**Team**:
The named participant that submits Bids, acquires Players, and holds a Roster and Budget during an Auction. Its name must be unique within the Auction, and it may have a logo and color.
_Avoid_: Club, bidder

**Auction Invitation**:
A targeted, single-use invitation that authorizes one User to become a Team Representative. An invited person must register before accepting if they do not yet have an account.
_Avoid_: Team join code, public invitation

**Roster**:
The Players assigned to a Team for an Auction. Its size must remain between the Auction's configured minimum and maximum.
_Avoid_: Squad list, player list

**Player Representative**:
A Team Representative who is also a Player. The Player starts on the represented Team's Roster, counts toward its total and Tier limits, and is not offered for bidding.
_Avoid_: Playing bidder

**Outside Representative**:
A Team Representative who is not a Player in the Auction. An Outside Representative does not occupy a Roster position.
_Avoid_: Non-playing leader

**Budget**:
The total number of Credits available to a Team in an Auction. Every Team begins the Auction with the same Budget.
_Avoid_: Wallet, balance, money

**Credit**:
A whole-number, virtual, non-cash unit used only for bidding within an Auction.
_Avoid_: Currency, coin, money

**Simple Rules**:
An Auction rule mode with a shared starting Budget, minimum and maximum Roster sizes, and an Auction-wide default Starting Price that individual Players may override.

**Tiered Rules**:
An Auction rule mode that adds custom Player Tiers, tier-specific starting prices, and tier-specific roster constraints.

**Tier**:
An ordered Player category configured by the Organizer for an Auction using Tiered Rules. Every Player belongs to exactly one Tier before the Auction starts.
_Avoid_: Group, class, category

**Active Tier**:
The Tier from which Players may currently be offered. Only one Tier is active at a time.
_Avoid_: Current group

**Active Player**:
The Player currently open for Bids. Only one Player may be active in an Auction at a time.
_Avoid_: Current lot

**Random Selection**:
The system's choice of the next Player from the Active Tier. The selected Player is shown to every participant and cannot be redrawn without a recorded reason.
_Avoid_: Random pick

**Starting Price**:
The first valid Bid amount for a Player. A Tier supplies the default Starting Price, and the Organizer may override it for a specific Player before bidding starts. A Player keeps the same Starting Price when offered again.
_Avoid_: Base price, initial bid amount

**Bid Increment**:
The fixed number of Credits by which the next valid Bid exceeds the current price.
_Avoid_: Bid step

**Bid**:
A Team's offer of Credits for the current Player, submitted through its Team Representative.
_Avoid_: User bid, personal bid

**Rejected Bid**:
A submitted Bid the Auction does not accept because it violates timing, Budget, Roster, duplication, or another Auction rule. Only the Organizer and submitting Team Representative may inspect its amount, server time, and reason.
_Avoid_: Failed sale

**Legal Completion**:
A possible allocation of the remaining Players that lets every Team meet its minimum total and Tier requirements without exceeding its Budget or maximum Roster limits.
_Avoid_: Possible finish

**Unsold Pool**:
Players who received no valid Bid when offered. The Organizer may offer them again without a fixed retry limit.
_Avoid_: Leftover players

**Final Unsold**:
The result assigned to a Player left in the Unsold Pool when the Organizer closes it after every Team meets its minimum requirements.
_Avoid_: Unresolved player

**Unsold Round**:
An Auction period in which the Organizer offers Players from completed Tiers' Unsold Pools again. After every Player in the Active Tier has been offered once, the Organizer may start an Unsold Round or activate the next Tier.
_Avoid_: Unsold group

**Forced Assignment**:
The allocation of an unsold Player to a Team that still needs that Player's Tier, without a Bid. The Team pays the Player's current Starting Price.
_Avoid_: Forced sale, free player

**Sale**:
The completed acquisition of a Player by a Team through a winning Bid or Forced Assignment.
_Avoid_: Purchase

**Sale Reversal**:
An Organizer correction that refunds a completed Sale and returns its Player to the Unsold Pool. The Auction must be paused and remain capable of Legal Completion before bidding resumes.
_Avoid_: Delete sale

**Audit Entry**:
An immutable record of a fairness-affecting Auction action, its server time, responsible User, and reason when required. Organizers and Team Representatives see the full fairness history.
_Avoid_: Editable history item

**Auction Copy**:
A new Draft Auction created from an earlier Auction. Copied Player Entries retain names, roles, External Player IDs, phone numbers, and custom field values; the Organizer chooses whether to copy Tier and price information or configure it again.
_Avoid_: Reopened auction

**Paused Auction**:
A Live Auction state in which the Organizer temporarily stops new Bids and any active countdown.
_Avoid_: Stopped auction

**Manual Close**:
An Auction closing mode in which the Organizer starts a three-second closing warning. A new valid Bid returns bidding to the open state; otherwise, the Player is sold when the warning ends.
_Avoid_: Host mode

**Timed Close**:
A configurable Auction closing mode in which a countdown determines when bidding for the current Player ends. Its default duration is thirty seconds, and a valid Bid during the final five seconds resets the remaining time to five seconds.
_Avoid_: Automatic mode

**Auction Results**:
The read-only record of final Rosters, Credits spent and remaining, Tier counts, sale prices, Forced Assignments, and unsold Players. The Organizer and Team Representatives may export Auction Results as CSV or PDF. The Organizer's CSV includes every supplied Player phone number; a Team Representative's CSV includes phone numbers only for Players on that Team's Roster. The PDF never includes phone numbers.
