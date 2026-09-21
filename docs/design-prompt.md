# TournyHub — Design Brief for All Pages & Features

> **Purpose**: This document is a brief for a product designer. It describes every
> page, screen, and interactive feature in TournyHub so the designer can produce
> faithful designs, component specs, and a design system that matches the
> codebase's current architecture and constraints.
>
> **Project status**: Private, non-commercial beta. One Live Auction at a time,
> 16 recommended Teams, max 32, max 2,000 Player Entries, max 40 connected tabs.
> Live bidding is server-authoritative: the browser submits commands and renders
> committed server state. No tournament fixtures, standings, scores, public
> discovery, read-only Viewers, offline support, push notifications, or real-money
> features exist in v1.

---

## 1. Project & Tech Context

TournyHub is a **Next.js 16 + TypeScript** application using:

- **shadcn/ui** with **Base UI** foundation and **Nova preset** for primitives
- **Tailwind CSS v4** with custom OKLCH color tokens
- **Geist Sans** (sans) and **Geist Mono** (mono) fonts
- **Better Auth** for email OTP + Google passwordless sign-in (no passwords)
- **TanStack Query** for server state, **TanStack Table** for data tables, **Zustand** only for short-lived presentation state
- **Supabase** PostgreSQL (authoritative), Realtime (low-latency fan-out), and Storage (Team logos + exports)
- **Lucide React** for icons (one icon library)

**Deployment**: Vercel Hobby, Supabase Free, Gmail SMTP via Nodemailer.

### Design System Constraints

| Token | Value / Rule |
|---|---|
| **Primary** | Indigo |
| **Completed states** | Green |
| **Warnings** | Amber (closing warnings) |
| **Destructive / rejected** | Red |
| **Team colors** | Identifier-only — never conveys state without a label or icon |
| **Numerals** | Tabular numerals for live prices, Budgets, timers, and counts |
| **Style** | Neutral sports control-room aesthetic |
| **Tone** | "No confetti or casino imagery" |
| **Motion** | Restrained, interruptible, disabled/reduced via User preference |
| **Sounds** | Opt-in, start muted |
| **Layout** | Responsive desktop + mobile, light + dark, English copy, local-time display (UTC storage) |
| **Bid submission** | One action, no confirmation dialog. Button shows exact next price, goes pending on submit, reports authoritative result |

Color **never** carries state alone — always pair with a label or icon.

---

## 2. Auth & Account Pages

### Sign-In Page — `/sign-in`

**Purpose**: Passwordless entry point. Email OTP (one-time code) or Google OAuth.

**Flow**:
1. User enters email → clicks "Send code" → system enters OTP step
2. OTP step shows a 6-digit code input + "Resend" button with a cooldown timer
3. Google option is available only when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are configured
4. OAuth errors (`email_not_verified`, `account_not_linked`, `email_does_not_match`) display inline friendly messages
5. Rate limiting: 429 returns "Too many attempts. Please wait before trying again."
6. OTP errors: expired (`OTP_EXPIRED`), incorrect (`INVALID_OTP`), too many attempts (`TOO_MANY_ATTEMPTS`)
7. `next` query param: only accepts relative paths starting with `/` (not `//`) — prevents open redirect

**Key UI states**:
- Email step: email input + submit button
- OTP step: code input (auto-focus, auto-submit on complete), resend button with cooldown ("Resend in Xs"), error display
- Loading state: spinner on submit buttons
- Centered card on a full-height page with centered form

**Redirect logic**: If already signed in, redirect to `next` param or `/app`.

---

### Account Settings Page — `/app/account`

**Purpose**: User preferences, sessions, and Google account linking.

**Visible fields** (pre-filled from server):
- **Display name** (editable)
- **Email** (read-only)
- **Appearance**: Light / Dark toggle
- **Sound enabled**: toggle (default off; controls live auction sounds)
- **Sessions list**: each showing device/browser name (parsed from User-Agent), creation date, expiry date, IP address. Active session has a "Revoke" button. Revoking requires re-authentication ("fresh auth check").
- **Google linking**: Shows "Link Google" button if not linked; "Unlink Google" if linked. OAuth errors display inline.

**State management**:
- Edits to name, appearance, sound trigger autosave or explicit save
- Session revocation and Google linking/unlinking go through Better Auth
- Reauthentication flow: request re-auth code → verify code → then perform destructive action
- Shows success/error status messages after each operation

**Layout**: Card-based sections on a max-width-2xl page.

---

## 3. Dashboard / Landing — `/app`

**Purpose**: Central hub showing all Auctions the User organizes, represents, is invited to, and has archived.

**Sections** (each a Card):
1. **Auctions you organize** — list of Draft, Ready, Live, Paused, Completed, Cancelled Auctions
2. **Teams you represent** — Auctions where you operate a Team's bidding controls
3. **Pending invitations** — Team invitations waiting for response (currently shows empty state placeholder)
4. **Archived Auctions** — Hidden Auctions retained 7 days before permanent deletion. Each shows title, previous status, and "recoverable until" date with a "Restore" button

**Auction row**: Title + Game name, status badge (secondary variant, capitalized). Clicking navigates to the appropriate entry point based on status:
- Live/Paused → `/live`
- Completed/Cancelled/Archived → `/results`
- Draft/Ready → `/setup/basics`

**Actions**: "New Auction" button (primary) in the page header.

**Layout**: Header with "New Auction" button, vertical flex column of cards, max-width 3xl.

**Background behavior**: On load, purges expired Archived Auctions (7-day window closed) — no notification to user.

---

## 4. New Auction — `/app/auctions/new`

**Purpose**: Start a new Draft Auction or copy from a previous one.

**Two components**:
1. **NewAuctionForm** — the basics editor form (title, game, rules mode, close mode) with autosave
2. **CopyAuctionForm** — lists previous Auctions (completed/cancelled) as copy sources. Copying creates a new Draft with:
   - Rules, Custom Player Field definitions, and selected Player Entries
   - Copied entries retain names, roles, External Player IDs, phone numbers, custom field values
   - Organizer chooses whether to retain Tiers and prices or reconfigure
   - Never copies: User links, Team invitations, Bids, Sales, results

**Layout**: Centered vertical flex column.

---

## 5. Auction Setup Wizard — `/app/auctions/[id]/setup/*`

**Purpose**: Build a Draft Auction from scratch. A 7-section wizard with persistent autosave.

**Setup Nav** (sidebar, collapses to horizontal scrollable on mobile):
- Basics → Players → Teams → Representatives → Rules → Tiers (tiered only) → Readiness
- Current section highlighted; Tiers only shows when rules mode is "tiered"

### 5.1 Basics — `/setup/basics`

**Fields**:
- **Auction title** (required)
- **Game name** (required) — free text, no predefined list
- **Rules mode**: Simple Rules / Tiered Rules (radio toggle)
- **Close mode**: Manual Close / Timed Close (radio toggle)

**Autosave**: Debounced 600ms; shows "Saving" / "Saved" / "Failed to save" state. Unsent values flushed on unmount.

### 5.2 Players — `/setup/players`

**Purpose**: Add, edit, delete, and import Player Entries.

**Two tabs/modes**: Manual editing + CSV/XLSX import.

**Manual Player Entry fields**:
- Display name (required)
- External Player ID (optional, must be unique within Auction)
- Role (optional)
- Phone number (optional — visible to Team Representatives during Live/Paused; restricted after completion)
- Starting Price override (optional, per-player)
- Custom Player Fields (dynamically defined)

**Duplicate display name warning**: Allowed but flagged.

**Import flow** (CSV or XLSX):
- File selection → worksheet selection (multi-sheet files) → column mapping (drag/drop or dropdown mapping)
- Column mapping supports: standard fields (name, role, external ID, phone, starting price) + Custom Player Fields (prefixed `custom.`)
- Preview table: up to 50 rows, phone numbers shown as "Phone provided" presence only (not the value)
- Downloadable errors CSV
- All-or-nothing commit: blocking errors must be resolved before any data is written
- Import size limit and formula defense (rejects formula payloads like `=cmd|...`)
- 2,000 Player Entry cap enforced

**UI**: Card-based editor with "Add Player" form, player table (TanStack Table) with inline edit/delete, and the import widget in a card.

### 5.3 Teams — `/setup/teams`

**Purpose**: Create Teams, calculate feasible counts, configure budgets.

**Manual Team creation**:
- Team name (unique within Auction)
- Team color (optional — used as accent only, never conveys state)
- Team logo upload (optional — stored in Supabase Storage)
- Logo removal button

**Calculate Teams**:
- Takes: player count, preassigned Player Representatives, min/max Roster sizes, Tier constraints
- Shows all feasible Team counts with a recommendation
- Organizer chooses a count → system generates unnamed Teams without representatives

**UI**: List of Team cards with name, color, representative status, player rep indicator, logo preview. "Calculate Teams" form at top. Each Team has edit/delete controls.

### 5.4 Representatives — `/setup/representatives`

**Purpose**: Assign a representative to each Team. Two types:

1. **Player Representative**: A Player Entry from the same Auction who is also a User, assigned to that Team. Counts toward roster and Tier limits; excluded from bidding.
2. **Outside Representative**: Any registered User invited via email. Does not occupy a roster position.

**Per-team controls**:
- Assign a Player Representative (dropdown of available unassigned Player Entries)
- Invite an Outside Representative (email input → single-use invitation token)
- Invitation supersession: issuing a newer invitation for a Team invalidates older ones
- Representative replacement (allowed in Draft, Ready, or Paused states)

**Invitation flow**:
- Enter email → system generates single-use token → email sent with link to `/invitations/[token]`
- Invitee must verify email and register if no account exists
- Invitation must match the exact invited verified email

**UI**: List of Team rows, each showing team name, current representative (or "No representative"), and assign/invite form.

### 5.5 Rules — `/setup/rules`

**Purpose**: Configure bidding mechanics.

**Simple Rules fields**:
- Shared starting Budget (per Team, equal)
- One default Starting Price (can be overridden per Player)
- One fixed Bid Increment
- Minimum Roster size
- Maximum Roster size

**Tiered Rules adds**:
- Ordered, Organizer-defined Tiers (configured in separate Tiers section)
- Default Starting Price per Tier (can be overridden per Player)
- Shared min/max Player counts per Tier for every Team
- Fixed Tier order; one Active Tier at a time

**Close mode** (also set here):
- **Manual Close**: Organizer initiates a 3-second closing warning; a valid Bid during warning returns to Open
- **Timed Close**: Configurable duration, default 30s; valid Bid in final 5s resets timer to 5s

**Save**: Explicit "Save" button, shows success/error. Values are whole-number Credits.

**UI**: Card with form fields for current rule mode. Switch between Simple/Tiered shows/hides Tier-specific fields. Timed Close has a seconds input.

### 5.6 Tiers — `/setup/tiers` (Tiered Rules only)

**Purpose**: Define and order Tiers; assign Players to Tiers.

**Tier management**:
- Create tier with: label, min per Team, max per Team, starting price
- Drag-to-reorder tiers (fixed order after bidding begins)
- Edit inline, delete (before live)
- Every Player must belong to exactly one Tier before Auction starts

**Player assignment**:
- Drag/drop Players between Tiers, or dropdown assignment per Player
- Unassigned Players appear in a separate "unassigned" bucket

**UI**: Kanban-style board or table with Tier columns, each containing assigned Players. Tier header shows min/max and price.

### 5.7 Readiness — `/setup/readiness`

**Purpose**: Diagnose whether the Auction can start. Read-only analysis that recomputes on page open.

**Readiness is derived** — opening this page computes current state: a complete Draft becomes **Ready**; an invalidated Ready Auction returns to **Draft**.

**Readiness errors** grouped by:
- Teams (need ≥ 2 uniquely named Teams, every Team has a representative)
- Players (required data present, External IDs unique)
- Rules (valid positive whole numbers for prices, Budget, increment)
- Tiers (assignments present, all Players assigned when using Tiered Rules)
- Invitations (all accepted)
- Feasibility (available Players can satisfy every Team's minimums; at least one Legal Completion exists)

Each error links to the affected record (e.g., `/setup/teams`, `/setup/rules`).

**Start button**: Only enabled when all Readiness errors are resolved AND every Team has an accepted representative. Starting launches the Live Auction.

**UI**: Alert banners for errors grouped by category, each with clickable links. Large "Start Auction" button at bottom.

---

## 6. Live Auction Console — `/app/auctions/[id]/live`

**Purpose**: The real-time bidding interface. This is the highest-fidelity screen and the most visually distinct — a "sports control room."

**Two roles**:
- **Organizer** — full controls (start players, pause/resume, close, manage players, complete)
- **Representative** — sees Team status + Bid button only

### Core display (shared)

**Active Player card**:
- Display name (large)
- Tier label (if applicable)
- Starting Price
- If no Active Player: shows "No Active Player" message

**Status strip** (flex-wrap row of key indicators):
- **Lifecycle**: live / paused (capitalized)
- **Connection**: "Live" or "Reconnecting…" (red if stale — 3 missed polls = 6s)
- **Controls**: "Ready" or "Unavailable" (red if stale/pending)
- **Current price**: current highest bid amount (tabular numerals), or Starting Price
- **Leading**: Team name with the current winning bid, or "No Bids"
- **Next Bid**: exact amount for the next bid button (tabular numerals)

**Countdown timers**:
- **Closing warning**: "Closing in 3.0s" (amber) — Manual Close 3-second warning
- **Timed close**: "Timed Close in 30.0s" — Timed Close mode countdown
- **Finalizing**: "Finalizing…" (assertive live region) when timer hits zero

**All timers are estimates** — PostgreSQL timestamps are authoritative. Browser clock offset is calculated and applied.

**State message area**:
- Rejection messages (destructive)
- Notice messages (success/info, polite live region)
- Paused state explanation: "Bidding is suspended. The Active Player and the leading Bid are preserved."

**Sound toggle**: Switch for live sounds (off by default), labeled.

### Representative view — Your Team card

Visible only to Team Representatives:
- **Team name** as card title
- **Budget**: remaining Credits (tabular numerals)
- **Roster**: current count / maximum
- **Bid button**: 
  - Shows exact next price: "Bid 25"
  - Goes pending (spinner) on click
  - Disabled when: not ready / connection stale / finalizing / team is leader / no active player / no next bid available
- **Disabled states show explanatory text**: "Your Team leads this Player.", "Bidding is suspended while the Auction is Paused.", "Finalizing this Player…", "Reconnecting before bidding is available…", "Bidding is not available right now."

**Bid submission is one action** — no confirmation dialog. The browser does not mark a Bid as accepted until PostgreSQL commits it.

### Organizer controls card

Visible only to Organizers:
- **Pause / Resume** button (toggles based on lifecycle)
- **Complete Auction** button (disabled while not paused, while there's an active Player, or while Unsold Pool has items)
- **Manage Auction** link (appears when paused — navigates to `/manage`)

**Player selection** (below main controls):
- Dropdown of eligible Players (from unopened Tiers)
- "Offer Player" button (manual selection) 
- "Random" button (random selection — once shown, cannot be redrawn without recorded reason)
- Both disabled when an Active Player exists

**Closing controls** (when paused):
- Manual Close: "Start closing warning" / "Cancel closing warning" (3-second warning)
- Timed Close: pre-configured duration (set in Rules — not editable live; changes require pause + manage flow)

**Corrections** (when paused, via Manage Auction or inline):
- Cancel highest Bid (restore previous Bid or Starting Price)
- Reverse Sale (refund Team, return Player to Unsold Pool) — requires sale ID input
- Add Players (only to unopened Tiers)
- Increase Budget (equal increase across all Teams)
- Change Rules (preserving completed Sales and Legal Completion)
- Transfer ownership
- Replace Team Representative

**Organizer keyboard shortcuts** (do not fire while typing in a field):
- Pause/Resume
- Close toggle (manual mode only)
- Next Player (random selection — only when no Active Player)
- Mark unsold
- (See `live-feedback.ts` for full shortcut list)

### Live Auction states

| Lifecycle | Behavior |
|---|---|
| **Live** | Bidding active, timer running |
| **Paused** | No new Bids, countdown frozen, Active Player + leader preserved |
| **Finalizing** | Timer hit zero, awaiting committed Sale/Unsold from server |
| **Completed** | Read-only, links to Results page |

### Rejected Bids card (shared, organizer + submitting rep only)

- "Rejected Bids" header with description "Visible only to the Organizer and the submitting Team."
- List of rejected Bid amounts + reasons (tabular numerals)

---

## 7. Manage Auction — `/app/auctions/[id]/manage`

**Purpose**: Make controlled, audit-recorded changes to a Draft, Ready, or Paused Auction. Only available when not Live (or while Paused).

**Display**: Header shows status label (Draft/Ready/Paused), current revision number, and "Controlled changes are recorded in the Audit History."

**Manage Console** sections:
1. **Budget**: Increase every Team's Budget equally (cannot decrease or change unequally)
2. **Representatives**: Replace a Team Representative (per-team form — Player Entry dropdown + email input, requires reason)
3. **Rules**: Change Rules that preserve completed Sales and Legal Completion (cannot change Starting Prices after bidding begins)
4. **Players**: Add Players only to unopened Tiers
5. **Ownership transfer**: Transfer Organizer to an eligible User (must not represent a Team in that Auction)
6. **Auction cancellation**: Cancel a Live Auction only while Paused

**Archive button** appears for Draft or Ready status.

**Layout**: Vertical stack of cards on max-width-4xl page, "Dashboard" link in header.

---

## 8. Results — `/app/auctions/[id]/results`

**Purpose**: Read-only final results. Available to Organizer, Team Representatives, and Platform Administrators (with reason).

**Header**: Auction title + "Dashboard" link.

**Results View** contains:
1. **Team results** (one card per Team):
   - Team name + logo
   - Spent Credits / Remaining Budget (tabular numerals)
   - Roster count
   - Tier counts breakdown
   - Player table: Player name, Tier, Source (Bid / Forced Assignment / Player Representative), Price
   
2. **Player details** (expandable `<details>`):
   - Contains phone numbers (only where the User is authorized to see them)
   - Lifecycle explanation: "Organizer always sees them; Team Representative sees them while Live or Paused, and afterwards only for their own Roster. PDF never contains phone numbers."

3. **Unsold Players** section (Final Unsold Players)

4. **Export actions** (Organizer only):
   - **CSV export**: Organizer gets all phone numbers; Team Representative gets only their own Roster phone numbers. Formula escaping applied.
   - **PDF export**: Never includes phone numbers.

5. **Archive button** (Organizer only, when Completed or Cancelled): "Archive Auction" — hides for 7 days, then permanent deletion.

**Phone visibility lifecycle**:
- Organizer: always sees all phone numbers
- Team Representative: sees phone numbers during Live/Paused; after completion, only for their own Roster
- PDF: never includes phone numbers
- Phone numbers never appear in default tables — only in the explicit details section

**Layout**: max-width-4xl page, vertical flex column.

---

## 9. Lifecycle & Copy — `/app/auctions/[id]` (manage sub-routes)

**Purpose**: Archive, restore, and copy Auctions.

**Actions**:
- **Archive Auction** (button on Results page for Completed/Cancelled): Hides the Auction for 7 days. No reminder email.
- **Restore Auction** (button on Dashboard for Archived): Restores back to its previous status during the 7-day window.
- **Copy Auction** (from `/app/auctions/new`): See section 4.

**Archive lifecycle**: Archived → 7 days → permanent deletion (purged on next Dashboard load). No notification.

---

## 10. Platform Administration — `/app/admin`

**Purpose**: Platform Administrator tools. Access is allowlist-gated (database role) — regular Users get 404.

### Administration Dashboard — `/app/admin`

**Controls**:
- **Search** field: filters both Users and Auctions lists
- **Users table**: each row shows User info + status; Suspend button (requires reason). Suspending also revokes all active sessions.
- **Auctions table**: each row shows Auction title, Organizer email, status + visibility; Hide/Unhide button (requires reason). Hiding keeps all records but makes the Auction unavailable to participants.

### Moderation Inspect — `/app/admin/auctions/[id]`

**Purpose**: Read-only inspection of an Auction. Administrator cannot edit Rules, Teams, Bids, Sales, or Results.

**Flow**:
1. Enter moderation reason (text field, required)
2. Submit → reason is recorded as immutable moderation record
3. Read-only summary displayed: counts and lifecycle only (no Roster, prices, phone numbers, or credentials)

**Layout**: max-width-3xl page, "Administration" link in header.

---

## 11. Invitation Acceptance — `/invitations/[token]` (separate auth flow)

**Purpose**: Accept a Team invitation. Accessible without being signed in.

**Flow**:
- Token is single-use, carried in the emailed link
- If the invitee has no account → they register first (sign-in flow), then accept
- If the invitee has an account → they sign in, then accept
- Invitation must match the exact invited verified email
- Accepting assigns the User as Team Representative for that Team

**Layout**: Centered card, similar aesthetic to Sign-In page but branded as invitation acceptance.

---

## 12. Team Logo Upload — `/app/auctions/[id]/teams/[teamId]/logo` (API route)

**Purpose**: Handle Team logo image upload to Supabase Storage.

**Details**:
- POST route for image upload
- GET route for image retrieval
- Optional — Teams may have no logo

---

## 13. Feedback — `/app/feedback`

**Purpose**: Authenticated beta feedback form. Also embedded in the global footer as a collapsible `<details>`.

**Fields**:
- **Category**: dropdown (Bug, Feature request, Question, Other)
- **Message**: free-text textarea (minimum length enforced)
- **Page**: derived from URL — not selectable. The footer form reports the current page; the standalone page reports `/app/feedback`.

**Security constraints**:
- Reports page URL, User, category, and message
- Never attaches: Auction data, phone numbers, OTP codes, or invitation tokens
- The page value comes from `usePathname()`, not a query parameter — cannot be redirected to another Auction or carry a token

**Layout**: Card with form fields (max-width-2xl page).

---

## 14. Global Layout & Navigation

### App Shell — `/app` layout

**Header** (all authenticated pages):
- Left: "TournyHub" logo text link → `/app`
- Right: User name/email (hidden on mobile), Admin link (if admin), Account link, Sign Out button

**Skip link**: "Skip to main content" (sr-only, visible on focus)

**Footer** (all authenticated pages):
- Collapsible "Beta feedback" `<details>` containing the FeedbackForm
- Reports the current page via `usePathname()`

### Protected routing:
- Unauthenticated access to any `/app/*` route redirects to `/sign-in`
- The Sign-In page checks for an existing session and redirects to `/app` or `next` param
- Better Auth session expiry, replay protection, and cooldown apply

---

## 15. Cross-Cutting Features

### Autosave
- Basics editor: 600ms debounce, "Saving / Saved / Failed" indicator
- All other setup sections: explicit Save button with success/error feedback

### Tables
- TanStack Table for: Players, Teams, Invitations, Results, User list (admin), Auction list (admin), Player details, Rejection list
- Moderate density on setup/results screens; more spacious on Live

### Empty states
- Dashboard: "You haven't created an Auction yet." etc.
- Admin: "No Users matched." / "No Auctions matched."
- Invitations: "You have no pending invitations."

### Loading states
- Page-level loading.tsx in setup layout
- Spinner on pending buttons
- Skeletons where TanStack Query is fetching

### Error boundaries
- Page-level error.tsx in the app layout
- not-found.tsx for 404s (unrelated users, deleted auctions)

### Responsive
- All pages use `max-w-*` centered containers
- Setup nav collapses from vertical sidebar to horizontal scrollable on mobile
- Tables scroll horizontally on small screens
- Forms use `flex-wrap` for responsive field layouts

---

## 16. Color & State Semantics Reference

| State | Color | Usage |
|---|---|---|
| Primary actions | Indigo | New Auction, Start Auction, Bid, Offer Player, Save |
| Success/Complete | Green | Completed Auction badge, saved state |
| Warning | Amber | Closing warning (3s timer), timed close countdown |
| Destructive | Red | Cancel Bid, Reverse Sale, Cancel Auction, Reject, errors |
| Pending | Spinner | During mutations (save, bid, import, etc.) |
| Stale/offline | Red text | "Reconnecting…", "Controls: Unavailable" |
| Inactive/disabled | Muted foreground | Non-interactive text |
