# TournyHub Design System

> _"The interface is the field of play."_

TournyHub is a live player auction platform. Every visual decision here is
made so that Organizers running a Draft, Team Reps bidding in a Live Auction,
and Team Captains reviewing Final Results feel like they are standing on
the same lit stage — not reading a spreadsheet.

The reference image is `public/background.png`. The permanent dark canvas is
the arena; the royal blue and electric cyan accents are the stage lights;
the slanted panels, neon-rimmed badges, and trophy centerpiece are the
visual vocabulary every surface borrows from.

---

## 1. Brand foundations

### 1.1 Voice

- **Dramatic but readable.** The hero glows, but a Bid amount in the middle
  of a Live console must be legible at 16:9 from a laptop across the room.
- **Sporting, not gamer.** Avoid sci-fi HUD patterns (hex grids, monospace
  scanlines). Use stadium tropes: pennant banners, spotlights, trophies,
  team crests.
- **Fairness is the product.** When an action affects the outcome of an
  Auction, it earns a richer surface. A 200-credit bid change can be a
  quiet row update; a Forced Assignment earns an alert.

### 1.2 Domain terms

The design follows the vocabulary in `CONTEXT.md`. Surfaces are named for
their Auction lifecycle state (`Draft`, `Ready`, `Live`, `Paused`,
`Completed`, `Cancelled`) and for the actor's role (`Organizer`,
`Team Representative`, `Platform Administrator`, `User`).

Avoid "bidding room", "host mode", "winner" framing. Use **Auction**,
**Live**, **Completed**, **Champion**.

### 1.3 Color roles

The palette has six roles. Every component must pick from these, not raw
OKLCH values.

| Role        | Token                 | Purpose                                               |
| ----------- | --------------------- | ----------------------------------------------------- |
| Canvas      | `--background`        | The permanent deep-navy arena floor.                  |
| Foreground  | `--foreground`        | Type and icon strokes.                                |
| Brand       | `--primary`           | Royal blue. Used for primary actions and brand marks. |
| Stage light | `--neon`              | Electric cyan. Hot accents, live state, glows.        |
| Money       | `--bid`               | Magenta-violet. Used exclusively for Bid amounts.     |
| Health      | `--roster`            | Teal. Roster health, completion state, success soft.  |
| Caution     | `--warning`           | Amber. Paused states, near-limit warnings.            |
| Danger      | `--destructive`       | Coral red. Cancelled auctions, rejected bids.         |
| Trophy      | `--warning`/`--arena` | Reserved for Completed Auctions and Champions.        |
| Spotlight   | `--spotlight`         | Deepest neutral. Backdrop for LiveAuctionStage.       |

### 1.4 Color tokens

All colors are defined in `src/app/globals.css` as one permanent OKLCH dark
palette. Never hardcode hex; always reference a token through Tailwind
utilities (`bg-neon`, `text-bid`, etc.).

#### Permanent dark palette

| Token           | OKLCH                   | Use                         |
| --------------- | ----------------------- | --------------------------- |
| `--background`  | `oklch(0.13 0.025 260)` | Deep navy canvas            |
| `--foreground`  | `oklch(0.96 0.01 240)`  | Body type                   |
| `--primary`     | `oklch(0.78 0.13 235)`  | Electric cyan (royal stage) |
| `--neon`        | `oklch(0.84 0.09 235)`  | Hotter cyan for glows       |
| `--bid`         | `oklch(0.78 0.12 295)`  | Magenta-violet              |
| `--roster`      | `oklch(0.78 0.14 175)`  | Teal                        |
| `--warning`     | `oklch(0.82 0.15 75)`   | Amber                       |
| `--destructive` | `oklch(0.8 0.11 22)`    | Coral red                   |
| `--spotlight`   | `oklch(0.05 0.02 260)`  | Stage backdrop              |

TournyHub renders only this dark palette. `<html>` always carries `.dark` so
Tailwind dark variants remain compatible, while `:root` holds the same dark
tokens as a fallback. There is no appearance toggle or User-specific light
mode. Public authentication and authenticated pages share the arena canvas.

### 1.5 Typography

| Family  | CSS var          | Source     | Use                                   |
| ------- | ---------------- | ---------- | ------------------------------------- |
| Display | `--font-display` | Geist Sans | Headlines, auction names, banner text |
| Sans    | `--font-sans`    | Geist Sans | Body, buttons, controls               |
| Mono    | `--font-mono`    | Geist Mono | Bid amounts, Credit display, IDs      |

Display inherits `--font-sans` for tighter tracking, and shifts to
`--font-display` (Geist with display tracking) when set. Body
text uses 16px, line-height 1.6, measure 64–72ch.

#### Hierarchy (Rule of 3)

Every text block has exactly three levels — **hook**, **bridge**, **detail**.
Auction status headers use:

- **Hook** — `text-display text-2xl` auction name
- **Bridge** — `text-xs tracking-[0.18em] uppercase` lifecycle + game
- **Detail** — `text-sm text-muted-foreground` team count, scheduled time

### 1.6 Spacing (1-4-9 rhythm)

| Unit | Value | Where                                      |
| ---- | ----- | ------------------------------------------ |
| 1    | 4px   | Icon padding, inline gaps, button internal |
| 4    | 16px  | Paragraph, card padding, component gap     |
| 9    | 36px  | Section breaks, hero blocks, major shifts  |

Tailwind's default scale (`gap-1`, `gap-4`, `gap-9`) is the source of
truth. Never use `space-y-*`; always `flex flex-col gap-*`. Never combine
`w-* h-*` when `size-*` fits.

### 1.7 Radius

- `--radius: 0.625rem` — base
- `rounded-lg` for buttons, `rounded-xl` for cards, `rounded-2xl` for
  hero/spotlight panels. The trophy's silhouette is the only place
  hard angles are allowed (clip-path pennant banners).

### 1.8 Elevation

Two arena-specific elevations live in `globals.css`:

- `.arena-panel` — glassy panel with subtle ring + backdrop blur. Default
  for side panels (BidConsole, Teams list).
- `.arena-glow` — neon-rimmed surface with soft cyan glow. Default for the
  active Player card and the trophy.

Plus a `--shadow-arena-trophy` reserved for the ResultsTrophy and the
home hero spotlight.

`.setup-console` scopes the browser surfaces a long working session touches —
the caret, text selection, and thin scrollbars — so a console of dense
numerals does not sit on browser defaults.

---

## 2. Component library

Every component lives under `@/components/ui` (shadcn primitives) or
`@/components/arena` (TournyHub composites). Composites are made **only**
from primitives — never custom divs dressed up to look like a primitive.

### 2.1 shadcn primitives installed

`alert`, `avatar`, `badge`, `button`, `card`, `dialog`, `field`, `input`,
`empty`, `input-otp`, `label`, `native-select`, `select`, `separator`,
`sheet`, `sonner`, `spinner`, `switch`, `table`, `tabs`, `toggle`,
`toggle-group`, `tooltip`.

Components are `base` style (Base UI primitives, not Radix). Style:
`base-nova`. Icon library: `lucide-react`.

### 2.2 TournyHub composites (`@/components/arena`)

| Component              | When to use                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `<AuctionPanel>`       | The neon-rimmed rectangle framing every Auction module. Three tones.       |
| `<BidConsole>`         | The dedicated Bid placement surface a Team Rep uses inside a Live Auction. |
| `<TeamChip>`           | Team row in the Teams list / sidebar. Color comes from Team profile color. |
| `<PlayerRow>`          | Player row in the active-Tier list. Highlights the active Player.          |
| `<LiveBadge>`          | The pulsing "LIVE" indicator. Used in headers and live console.            |
| `<Trophy>`             | The SVG trophy centerpiece. Used in hero, completed auctions, sign-in.     |
| `<ArenaBanner>`        | The slanted pennant. `default` for hero labels, `sm` for a station header. |
| `<CreditDisplay>`      | Whole-number Credit display. Always monospace, always suffixed `cr`.       |
| `<LiveAuctionStage>`   | The whole Live Auction layout: trophy + active player + bid + lists.       |
| `<ResultsTrophy>`      | Completed Auction layout: trophy, champion, final standings.               |
| `<AuctionHero>`        | The full-bleed arena surface used for auction readiness.                   |
| `<AuctionStatusCard>`  | The auction list card on `/auctions`. One rail color per lifecycle state.  |
| `<StationRail>`        | The ordered station list of a multi-step Operate surface.                  |
| `<StationRailItem>`    | One station row: readiness lamp, label, open-requirement count.            |
| `<StationLamp>`        | The readiness lamp itself. `clear` / `pending` / `blocked` / `unknown`.    |
| `<StationPlate>`       | One station: pennant header, monospace readout, optional action footer.    |
| `<StationGroup>`       | A named division inside a plate, divided by a hairline rather than a box.  |
| `<CommandBar>`         | The bar pinned to the bottom of a working column: its one key action.      |
| `<Stat>` `<StatStrip>` | The monospace fact row. Facts only; an explanation never goes here.        |

### 2.3 Button variants (extended)

The default Button stays compatible with shadcn. TournyHub adds five
arena-flavored variants. Pick by intent, not by decoration.

| Variant            | When                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `default`          | Primary CTA in app UI (Save, Confirm, Continue). Always brand color.   |
| `outline`          | Secondary action in a panel.                                           |
| `secondary`        | Tertiary action in dense layouts.                                      |
| `ghost`            | Icon button, toolbar action.                                           |
| `destructive`      | Cancel, Delete, Reject Bid.                                            |
| `link`             | Inline reference.                                                      |
| **`neon`**         | Stage-level CTA: "Start Auction", "Place Bid", "Resume". One per page. |
| **`outline-neon`** | Lower-stakes neon action: "View Live", "Open Console".                 |
| **`ghost-neon`**   | Tertiary neon: tab toggle, filter chip.                                |
| **`bid`**          | **Reserved for actual Bid placement.** Always uppercase, tracked.      |
| **`trophy`**       | Completed-Auction CTA: "Export Results", "View Trophy".                |

Sizes:

- `xs` / `sm` / `default` / `lg` — standard toolbar / form.
- **`xl`** — hero CTAs (height 12, font-semibold). One per viewport.
- `icon` / `icon-xs` / `icon-sm` / `icon-lg` — icon-only.

Rules:

- **One neon Button per visible viewport.** Two or more dilutes the stage.
- **Filled Button labels meet at least APCA Lc 60 and WCAG 4.5:1.** Their
  hover colors stay opaque and move lighter so contrast cannot collapse over
  the arena image.
- **Outlined Button boundaries meet WCAG 3:1** against the dark card surface.
  Use the `--input` control-border token rather than a decorative divider.
- **Never use `variant="neon"` for inline actions** in dense rows. Use
  `ghost-neon` or `outline-neon`.
- **Bid placement is always `variant="bid"` and `size="xl"`.** No smaller.
  The eye must catch it from across the room.

### 2.4 Badge variants

| Variant       | Use                                                    |
| ------------- | ------------------------------------------------------ |
| `default`     | Standard brand badge.                                  |
| `secondary`   | Neutral category.                                      |
| `destructive` | Rejected bid, cancelled auction.                       |
| `outline`     | Borderline / Draft state.                              |
| `ghost`       | Hover-revealed only.                                   |
| `neon`        | **Live Auction** indicator. Always uppercase, tracked. |
| `bid`         | Used to label Bid amount pills.                        |
| `roster`      | "Ready" state and roster-health chips.                 |
| `warning`     | Paused state, soft warnings.                           |
| `success`     | Completed auction, sale completed.                     |

### 2.5 Alert variants

| Variant       | Use                                                           |
| ------------- | ------------------------------------------------------------- |
| `default`     | Neutral info — card-tinted, no glow.                          |
| `destructive` | Auction cancelled, rejected bid.                              |
| `neon`        | Live state changes — "Bidding is live", "Tier is active".     |
| `warning`     | Soft warnings — near budget, near roster cap.                 |
| `success`     | Sale completed, Forced Assignment recorded.                   |
| **`live`**    | Pulsing arena-glow Alert used at the top of the Live console. |

### 2.6 Forms

All forms follow shadcn rules:

- Wrap in `<FieldGroup>` and use `<Field>` per row.
- Use `<InputGroup>` + `<InputGroupAddon>` for buttons inside inputs.
- ToggleGroup for 2–7 options (Bid Increment choices, Rule Mode).
- Choice lists that must stay a real `<select>` use `<NativeSelect>` — the
  platform picker is faster for a long list and works before hydration.
- FieldSet + FieldLegend for grouped checkbox/radio (Custom Player Fields).
- A numeric field draws its unit inside itself (`cr`, `s`) rather than
  stating it in prose beneath the label.
- Validate with `data-invalid` on `<Field>` and `aria-invalid` on the
  control. Disabled submit only when the server requires it; prefer to
  show the error and let the user fix it.

The icon-in-button pattern uses `data-icon="inline-start"` / `inline-end`.
**Never** add sizing classes (`size-4`, `w-4 h-4`) to icons inside
components — the component handles icon sizing.

### 2.7 Auction lifecycle color rail

`AuctionStatusCard` shows lifecycle with a left-side color rail, never
text alone:

| State     | Token       | Rail                     |
| --------- | ----------- | ------------------------ |
| Draft     | muted       | muted-foreground/40      |
| Ready     | roster      | roster, soft glow        |
| **Live**  | neon        | neon with cyan glow halo |
| Paused    | warning     | amber rail               |
| Completed | success     | teal rail                |
| Cancelled | destructive | coral rail               |

---

## 3. Surfaces

The composition of the system: which composite lives on which page.

### 3.1 Landing (`/`)

Sports-campaign landing page with original stadium and team-huddle photography.
Barlow Condensed headlines pair with Geist body text. Scoped `landing-*` styles
use deep navy, cobalt actions, and light-blue headline accents without changing
the authenticated app's tokens. Sections cover sports, setup, auction features,
and common questions; all primary actions lead to `/app/auctions/new`.
Native disclosure controls and a keyboard-accessible mobile navigation keep
the page lightweight. Entry motion respects reduced-motion preferences.
The favicon and Apple touch icon use a simplified version of the blue T shield.
See `docs/design/landing-assets.md` for image provenance.

### 3.2 Sign-in / Invitations

Same arena tone, smaller canvas. `<Trophy size={72}>` in the form header.
Form uses `<Field>` + `<InputGroup>` for the OTP code.

### 3.3 Dashboard (`/app`)

The authenticated shell uses the same `public/background.png` canvas and dark
scrim as the sign-in page. The sidebar, header, footer, and content cards sit
on translucent glass surfaces so the workspace feels like one continuous
arena. Navigation stays visible on desktop and moves into a `<Sheet>` on
smaller screens.

The Dashboard opens with a compact arena hero and then uses full-composition
`<Card>` sections for organized Auctions, represented Teams, invitations, and
Archived Auctions. Populated sections use `<Table>` with status badges and
tabular dates. Empty sections use the shadcn `<Empty>` composition. The layout
must render real query results and must not use sample rows from the reference
mockup.

### 3.4 Live Auction (`/auctions/[id]/live`)

`<LiveAuctionStage>` — the primary surface. Hosts:

- Trophy + auction name + `<LiveBadge>` header.
- `<AuctionPanel tone="spotlight">` for the active Player.
- `<BidConsole>` for the Team Rep's Bid placement.
- Two side panels: Player rows and Team chips.

Secondary surfaces use `<AuctionPanel tone="glass">`. Forced Assignment
and Paused state use `<Alert variant="warning">` or `live`.

### 3.5 Completed Auction (`/auctions/[id]/results`)

Results use centered Team headings above moderate-density roster tables. Each
Team's stored color appears in a thin top strip and a tinted heading background;
names stay in the foreground color for contrast. Roster counts, spent Credits,
remaining Credits, and Tier counts sit between the heading and the Player rows.
On mobile, Source and Tier move beneath the Player name so Credits remain visible.

Team navigation links jump to each roster. The footer holds Copy roster, PDF,
and authorized Excel/CSV downloads. Excel preserves centered, colored Team
headings; CSV uses plain Team sections. PDFs use light printable sheets, repeated
Team headings on overflow, and aligned tables. Copy and PDF omit phone numbers.
Team order is setup order and must not imply standings or a Champion.

### 3.6 Organizer setup (`/auctions/new`, `/auctions/[id]/setup/*`)

The Setup console. An identity band (Auction name in display type, a
lifecycle `<Badge>`, a `<StatStrip>` of Game / Rules / Close, and Manage
Auction) sits above two columns:

- A `<StationRail>` on the left lists the stations in the order they are
  worked — Basics, Players, Teams, Representatives, Rules, Tiers (Tiered
  Rules only), Readiness. Every row carries a `<StationLamp>` lit by the
  same Readiness engine that gates the Auction, plus the count of open
  requirements that station owns. The rail is the Draft's progress map.
- The right column holds the active `<StationPlate>` and a sticky
  `<CommandBar>` carrying the open-requirement readout and the one neon
  Start Auction button. Starting lives only in that bar, on every station,
  and the server names what is missing when it refuses.

Each station is one `<StationPlate>`: a small `<ArenaBanner>` pennant names
it and a monospace readout at its right reports the save state and the
station's own count. Hairline `<StationGroup>` rules divide its work; the
plate footer holds the station's action. Rosters and ladders use `<Table>`
with a caption, or hairline-divided rows, and their empty state is the
`<Empty>` composition. Tiered Rules is a `<ToggleGroup>`, Custom Player
Fields a list of labelled inputs.

`/auctions/new` uses the same plate for both entries — Start a fresh Draft
(neon, one per viewport) and Copy an earlier Auction (outline).

Two rules keep the rail honest, because a gate that lies is worse than no
gate: the Readiness lamp reports the whole gate rather than the one group of
requirements it happens to own, and the console re-reads the route whenever
the Organizer moves station or a station saves. Setup is a shared layout, so
without the second rule the lamps and the launch count would replay whatever
the station looked like the first time it was opened.

### 3.7 Account / Admin

The Account route opens with a compact identity header (avatar, name, email,
current device, plus verified-email, Google, and session-count badges)
followed by a single `dashboard-panel` command column: **Profile**,
**Active sessions**, and **Connected accounts** stack as divided sections
with hairline separators instead of nested cards. Sessions render as compact
rows with device, active date, and IP on one line, with bulk sign-out actions
right-aligned in the section footer. A short ShieldCheck note replaces the
snapshot rail. Keep the page permanently dark and do not add an Appearance, Sound, or general
Preferences section. Recent-auth challenges open in a focused `<Dialog>` so
the page structure stays stable.

Admin routes use dense tables (`<Table>`) inside
`<AuctionPanel tone="glass">`. Both areas share the authenticated arena
sidebar and account header with the Dashboard.

---

## 4. Motion

Motion is part of the brand. Default timings:

| Use                  | Duration | Easing                       |
| -------------------- | -------- | ---------------------------- |
| Panel enter / exit   | 200ms    | `ease-out`, scale 0.97 → 1   |
| Bid amount tick      | 150ms    | `ease-out`, opacity flash    |
| LiveBadge pulse      | 2.2s     | `ease-in-out`, infinite loop |
| Trophy glow          | 2.2s     | `ease-in-out`, infinite loop |
| Banner reveal (hero) | 400ms    | `ease-out`, stagger 80ms     |
| Modal entrance       | 180ms    | `ease-out`, scale 0.96 → 1   |

Reduced motion is honored — the global rule in `globals.css` reduces every
animation to a single frame for users with `prefers-reduced-motion`. The
pulse on `<LiveBadge>` and `<Trophy>` becomes a static border + glow.

Stagger delays use `index × 20ms + random(±5ms)` jitter so sequences feel
human, never robotic.

---

## 5. States — every component has nine

Per the platform rule, every component must be designed for all nine
states. The auction surfaces bake these in:

| State    | Example surface                                               |
| -------- | ------------------------------------------------------------- |
| Idle     | `<AuctionPanel>` at rest                                      |
| Hover    | `<TeamChip>` shows Budget total on hover                      |
| Active   | Bid stepper button mid-press (`translate-y-px`)               |
| Focused  | `<Button>` shows neon ring on `:focus-visible`                |
| Loading  | Place-bid Button shows `<Spinner data-icon>` inside           |
| Empty    | "No Players in this Tier" empty state inside `<AuctionPanel>` |
| Error    | Rejected Bid → `<Alert variant="destructive">` toast + row    |
| Disabled | Place-bid Button disabled when Bid < currentBid               |
| Overflow | Tier name truncated with ellipsis; Player row → drawer        |

---

## 6. Accessibility

- All interactive elements are real `<button>`, `<a>`, `<input>` — never
  `<div onClick>`.
- Focus rings stay visible at all times. The `:focus-visible` rule in
  `globals.css` is the only outline spec — never `outline: none`.
- Color is never the sole carrier of meaning. Auction state is always
  icon + text + color (LiveBadge's radio icon, AuctionStatusCard's rail,
  PlayerRow's active glow + thicker border).
- Live updates use `aria-live="polite"` for current bid and player
  announcement, `aria-live="assertive"` only for Forced Assignment.
- Bid amount updates announce via the bid input's accessible label.
- Forms: never use placeholder as the only label. Submit is never
  disabled until the form is valid — show the error and let the user fix
  it.
- All targets ≥ 44×44px on touch. Hit areas expanded with `::before` when
  the visible element is smaller.
- Minimum 16px font on inputs under 640px to avoid iOS Safari zoom.

---

## 7. Composition patterns

The arena is a **monitor** + **operate** surface. Apply the matching
rules:

- **Monitor** surfaces — Live console, audit feed, bid feed — use status
  boards, live counts, and right-aligned timestamps. Density high; visual
  hierarchy through scale, not boxes.
- **Operate** surfaces — Bid placement, Organizer setup, admin actions —
  use command bars, side panels, and direct manipulation. Always show the
  primary action in neon at the bottom of the right column.
- **Compare** surfaces — Results, Team standings, Roster comparison — use
  tables, ranked lists, and stable scanning lanes. Avoid cards; use rows
  with hairline dividers.
- **Decide** surfaces — Ready state, Confirm Start, Forced Assignment
  modal — use a focused pitch with one dominant neon action and a single
  destructive ghost.

---

## 8. Copy

- One verb per button: "Start auction", "Place bid", "Resume auction",
  "Force assign". No "OK", "Confirm", "Yes".
- **Never put a sentence under a heading.** A title carries its own weight;
  the fact behind it belongs beside the control it constrains, in the
  monospace register (`cr`, `max 2,000`, `3s warning`, `saves as you type`).
- Errors are recovery paths. "Bid rejected — only 240 credits remain."
  Never "Invalid input".
- Empty states teach the space: "No players in this tier yet. Import
  players from a CSV to begin."
- Loading copy names the work: "Recording bid…" not "Loading…".
- Sentence case everywhere. No exclamation points. Em dashes are reserved
  for the design system doc — not for product copy.

---

## 9. Smell test

If a reviewer can identify TournyHub as "the auction site" within two
seconds from any surface, the system is doing its job. Specific tells
that would betray AI generic UI:

- **Generic SaaS cream + violet** — refuse. The dark navy + cyan is the
  arena, and it must read in the first 200ms.
- **Pill buttons everywhere** — refuse. Reserve neon for the one stage
  action per viewport; everything else is outline / ghost.
- **Hero gradient over random stock photo** — refuse. Always `background.png`
  with the arena composition on top. The image is the canvas, not
  decoration.
- **Centered card hero on every page** — refuse. The Live console uses
  `LiveAuctionStage` with side panels, not a centered card.
- **Indistinguishable icon set** — refuse. Use `lucide-react` with the
  same icon family across surfaces (Gavel for Bid, Crown for Champion,
  Radio for Live).
- **A settings page in costume** — refuse. A multi-step Operate surface
  uses the station rail + plate + command bar composition, never a stack of
  titled cards with a sentence explaining each one.

---

## 10. Files

| Path                                            | Purpose                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `src/app/globals.css`                           | Color tokens, arena utilities, focus/motion rules.           |
| `src/app/layout.tsx`                            | Root layout: permanent dark class, TooltipProvider, Toaster. |
| `src/app/app/layout.tsx`                        | Authenticated arena shell and account header.                |
| `src/app/app/page.tsx`                          | Dashboard hero, Auction tables, and empty states.            |
| `src/features/navigation/app-navigation.tsx`    | Desktop and mobile authenticated navigation.                 |
| `src/components/ui/button.tsx`                  | Button + neon/bid/trophy variants.                           |
| `src/components/ui/badge.tsx`                   | Badge + neon/bid/roster/warning/success variants.            |
| `src/components/ui/alert.tsx`                   | Alert + neon/live/warning/success variants.                  |
| `src/components/ui/sonner.tsx`                  | Arena-styled dark toasts.                                    |
| `src/components/ui/*`                           | Other shadcn primitives (Dialog, Sheet, Table, Tabs…).       |
| `src/components/arena/index.ts`                 | Public barrel for TournyHub composites.                      |
| `src/components/arena/auction-panel.tsx`        | The base glassy/neon panel wrapper.                          |
| `src/components/arena/bid-controls.tsx`         | `<BidConsole>`.                                              |
| `src/components/arena/team-chip.tsx`            | `<TeamChip>`.                                                |
| `src/components/arena/player-row.tsx`           | `<PlayerRow>`.                                               |
| `src/components/arena/live-badge.tsx`           | `<LiveBadge>`.                                               |
| `src/components/arena/trophy.tsx`               | `<Trophy>` SVG.                                              |
| `src/components/arena/arena-banner.tsx`         | `<ArenaBanner>` pennant.                                     |
| `src/components/arena/credit-display.tsx`       | `<CreditDisplay>`.                                           |
| `src/components/arena/live-auction-stage.tsx`   | `<LiveAuctionStage>`.                                        |
| `src/components/arena/results-trophy.tsx`       | `<ResultsTrophy>`.                                           |
| `src/components/arena/auction-hero.tsx`         | `<AuctionHero>`.                                             |
| `src/components/arena/auction-status-card.tsx`  | `<AuctionStatusCard>`.                                       |
| `src/components/arena/station-rail.tsx`         | `<StationRail>` + `<StationLamp>`.                           |
| `src/components/arena/station-plate.tsx`        | `<StationPlate>` + `<StationGroup>`.                         |
| `src/components/arena/stat-strip.tsx`           | `<Stat>` / `<StatStrip>`.                                    |
| `src/components/arena/command-bar.tsx`          | `<CommandBar>`.                                              |
| `src/components/ui/native-select.tsx`           | `<NativeSelect>` for choices that stay a real `<select>`.    |
| `src/app/app/auctions/[id]/setup/layout.tsx`    | The Setup console shell: identity band, rail, gate bar.      |
| `src/features/auctions/setup/setup-stations.ts` | Station list and the Readiness → lamp mapping.               |
| `public/background.png`                         | The arena reference image.                                   |

When adding a new surface:

1. Check `arena/index.ts` first. Build from composites before adding new
   primitives.
2. Pick the closest shadcn primitive. Customize variants in `ui/*` only
   when the variant is shared by more than one component.
3. Honor the lifecycle color rail and the badge variant for state.
4. Match the spacing to the 1-4-9 rhythm. Never `space-y-*`.
5. Test the nine states and 200% zoom before merging.
