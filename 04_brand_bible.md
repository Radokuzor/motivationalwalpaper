---
name: motivationalwallpaper-brand-bible
description: Brand bible for motivationalwallpaper.com — master brand register, voice and word lists, logo, colour system (chrome + six profile worlds), typography scale, core components, and the Screen One design for mobile and desktop. Everything downstream (app, widget, email, SMS, community) inherits from here.
sources: [chat]
aliases: [brand, brand bible, brand book, identity, design system, style guide, screen one, colour, typography, voice]
---

# motivationalwallpaper.com — Brand Bible

**Version 0.1 · 2026-09-08 · living document · owner: Rad Okuzor**

Master brand register: **quiet premium / near-invisible.** The chrome (logo, nav,
capture flow, buttons, type) gets out of the way so the wallpapers carry the
emotion. Think gallery wall, not app.

A rendered companion with visual device mockups of Screen One lives at
`design/who-youre-becoming.html` (open in a browser). This markdown file is the
source of truth for everything else.

---

## §01 — Positioning

**A daily identity anchor, not a wallpaper site.**

motivationalwallpaper.com is a daily identity-reinforcement system. It meets you
on the one surface you already look at a hundred times a day — your lock screen —
with a picture of who you're becoming, then gives you one small action each
morning that proves you already are.

The wallpaper is the door. Nothing more. People don't change their wallpaper
every day, so the wallpaper's only job is to capture a way to reach you and route
you into the part that compounds: the widget, the notification, the text, the
weekly letter, the circle.

### The transformation arc

> Arrive: *"I'm not the person I want to be yet, and the gap is uncomfortable."*
> → Stay: *"Every morning something here reminds me who I'm becoming — and I'm
> starting to believe it."*

Open the identity gap on the screen, then close it one morning at a time.

### What it is / isn't

| It is | It isn't |
|---|---|
| A lock screen you look forward to seeing | A wallpaper subscription or drop platform |
| One profile-matched action a day, done in 60 seconds | A generic quote app or a meditation app |
| A quiet, private daily ritual — no audience, no metrics | A habit tracker that guilts you for missing a day |
| Content calibrated to the specific person you're becoming | One-size-fits-all wellness |

### The gap we own

Locket owns the phone screen but has no transformation intent. Fabulous owns
habit-stacking but feels clinical and identity-generic. Calm owns the daily
ritual but has no accountability and no screen presence. **Nobody owns a daily
visual identity anchor on the phone screen, tied to who you specifically are
becoming, followed by one micro-action that proves it.** The wallpaper is the
entry point none of them have.

---

## §02 — Voice & words

**The interface whispers. The wallpapers speak.**

The master brand voice is the voice of the site chrome, the capture flow,
buttons, empty states, and transactional email. It stays deliberately quiet so
the wallpapers — and each profile's own voice — carry the intensity. The six
profile voices (loud, tender, scriptural, hype) live inside the content, never in
the chrome.

### Six principles

1. **Calm, not loud.** No exclamation marks in the UI. No countdowns. The
   wallpaper may shout; the button may not.
2. **Second person, present tense.** "Here's yours." "Set it and go." You're
   talking to one person holding a phone.
3. **Shorter than feels comfortable.** Three words beats a sentence. A sentence
   beats two.
4. **Concrete over aspirational.** "Sent to your phone" — not "unlock your
   potential."
5. **Never guilt.** The midday check-in is a high-five, not a scold. A missed day
   gets "pick it back up," never "you broke your streak."
6. **Respect their intelligence.** They've seen every growth-hack landing page.
   Don't write another one.

### Master word list (chrome only)

Each profile has its own say / never-say list in §08, and those override this one
inside profile content.

| Say | Never say |
|---|---|
| become · becoming | unlock your potential |
| one morning at a time | hustle harder · crush it · 10x |
| your lock screen | new you · new year new me |
| here's yours | life-changing · game-changer |
| you showed up | limited time · don't miss out |
| proof · already | transform (aimed at the visitor) |
| quiet · private | journey (as filler) |
| send it to my phone | sign up / register / create account |

### Voice in place

- **Capture prompt** — "Where should we send it?" / *No account. No spam. Just the wallpaper.*
- **Confirmation** — "It's in your inbox." / *Two quick questions so tomorrow's fits you better.*
- **Primary button** — "Send it to my phone"
- **Missed-day notification** — "Yesterday got away. Today's still here."

---

## §03 — Logo & wordmark

**One lowercase word, set quietly.**

The name is a URL people already type and already rank for. The mark leans into
that: one word, all lowercase, no icon required. Lowercase signals the register —
personal, calm, not a corporation. One unbroken word signals it's a name, not a
description.

- **Wordmark:** `motivationalwallpaper` — Schibsted Grotesk Medium (500),
  tracking −0.02em, always lowercase.
- **`.com`:** optional, always in `--ink-faint`, never bolder than the name.
- **Monogram:** `mw` in a rounded square (14px radius), ink fill, paper text —
  for app icons and avatars.
- **Optional mark:** a minimal lock glyph whose shackle is an incomplete arc —
  it never closes; that's the gap. Sits left of the wordmark at 1:1 cap height.

### Rules

- Clear space on all sides = the height of the "m".
- Minimum width 120px on screen; monogram down to 16px.
- On a wallpaper: only over a scrim, at 60–70% opacity, top-left.

### Never

- No gradient, glow, bevel or drop shadow.
- No Title Case, no ALL CAPS, no spaces between the words.
- Don't set it in a serif or a script face.
- Don't stretch, condense or outline it.
- Don't place it unscrimmed on busy imagery.

---

## §04 — Colour

**Warm paper, near-black ink, a trace of brass.**

The chrome palette is almost monochrome on purpose. Neutrals are warm — bone, not
blue-grey — so the interface feels like paper rather than software. One accent, a
muted brass, appears only as a trace: the active scroll marker, a focus ring, a
link, the primary button on hover. If brass covers more than ~5% of any view,
pull it back.

### Chrome — light

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FAF9F7` | page ground |
| `--surface` | `#FFFFFF` | cards, frames, sheets |
| `--surface-2` | `#F2F0EB` | wells, table headers |
| `--ink` | `#17181B` | text, primary button |
| `--ink-soft` | `#57565A` | secondary text |
| `--ink-faint` | `#8A8A8E` | meta, placeholder |
| `--hairline` | `#E6E3DC` | 1px dividers |
| `--hairline-strong` | `#D6D1C6` | input borders |
| `--accent` | `#8F7142` | brass — trace only |
| `--accent-strong` | `#6E5636` | links, brass text |
| `--accent-soft` | `#EFE7D8` | focus glow, wash |

### Chrome — dark

| Token | Hex |
|---|---|
| `--paper` | `#101013` |
| `--surface` | `#17181C` |
| `--surface-2` | `#1E1F24` |
| `--ink` | `#F1F0EA` |
| `--ink-soft` | `#A2A1A6` |
| `--ink-faint` | `#6F6F74` |
| `--hairline` | `#2A2B30` |
| `--hairline-strong` | `#3B3C43` |
| `--accent` | `#C7A56D` |
| `--accent-strong` | `#DBC49B` |
| `--accent-soft` | `#221F18` |

### Rules

- **Chrome and world palettes never mix.** Brass is the only colour the interface
  owns. Every hue in §08 lives strictly inside wallpaper art, profile emails and
  profile widget skins — never on a button, a link or a nav.
- **Semantic colour** is reserved for the app's streak / check-in surfaces only,
  never the marketing site: success `#4E7A56` / attention `#B08643` / rest-day
  `--ink-faint`. Not accents; no brand weight.

---

## §05 — Typography

**Schibsted Grotesk, and nothing it doesn't need.**

One text family carries the whole interface. Schibsted Grotesk has enough
character in its heavy weights to hold a headline and stays calm at reading size
— it isn't the default grotesk everyone reaches for. IBM Plex Mono handles
anything that is data. No serif, no display face in the chrome. Hierarchy comes
from weight, size and tracking.

Google Fonts: `Schibsted Grotesk` (400/500/600/700/800), `IBM Plex Mono` (400/500).
Fallbacks: `system-ui, -apple-system, "Segoe UI", sans-serif` and
`ui-monospace, Menlo, monospace`.

| Role | Size (px / rem) | Weight | Tracking | Leading | Use |
|---|---|---|---|---|---|
| Display | 46 / 2.875 | 800 | −0.025em | 1.03 | hero, screen headlines (30 on mobile) |
| Title 1 | 28 / 1.75 | 700 | −0.015em | 1.15 | section headings |
| Title 2 | 20 / 1.25 | 600 | −0.01em | 1.3 | sub-heads, modal titles |
| Lead | 18 / 1.125 | 400 | 0 | 1.55 | opening paragraph of a section |
| Body | 16 / 1 | 400 | 0 | 1.6 | everything, buttons |
| Small | 14 / 0.875 | 400 | 0 | 1.5 | captions, microcopy |
| Label | 12 / 0.75 | 600 | +0.12em | 1 | eyebrows, tags, nav, table heads (uppercase) |
| Mono | 13 / 0.8125 | 400 | 0 | 1.5 | specs, code, data |

- The **lock-screen clock** is the one exception: it follows iOS, set in the
  device's own system face at ~300 weight.
- **Wallpaper message type** is set in each world's display face (§08), never in
  Schibsted Grotesk. The chrome font must never appear *on* a wallpaper.
- Keep running prose near 68 characters wide. Headings get `text-wrap: balance`.

---

## §06 — Core components

**Few parts, each doing one job.**

### Buttons — 44px tall, fully rounded (999px)

- **Primary:** rests on `--ink` with `--paper` text; fills with brass (`--accent`,
  white text) on hover — the only place brass touches a solid surface. One
  primary per view. Never two brass buttons in frame.
- **Ghost:** transparent, 1px `--hairline-strong` border, `--ink` text; border
  goes `--ink` on hover. Secondary actions.
- **On dark imagery (in-phone):** glass — `rgba(255,255,255,.16)` fill, 1px
  `rgba(255,255,255,.3)` border, 10px backdrop blur, white text.
- Focus-visible: 2px `--focus` outline, 2px offset.

### Email capture field

- 44px tall, 8px radius, 1px `--hairline-strong` border, `--surface` bg, 14px
  side padding, 15px text.
- Focus: brass border + 3px `--accent-soft` glow, no default outline.
- Real label sits above; placeholder is an example address (`you@email.com`),
  never instructions.

### Capture sheet

- Mobile: rises from the bottom, ~60% height, 20px top radius, grab handle,
  `--surface` bg.
- ≥900px: same content as a centred modal.
- Contents: heading "Where should we send it?", one-line helper, email field,
  full-width primary button "Send my wallpaper", 11px faint microcopy "No
  account. No spam. Just the wallpaper."

### Wallpaper card (gallery / desktop theme grid)

- 9:16 art area. One line of ≤6 words in the **world's** display face, centred in
  the safe band, on a top-and-bottom scrim so the iOS clock still reads.
- Foot strip carries theme name + export size only — no like counts, no author.

### Scroll indicator

- Desktop only, inside the left panel: a vertical stack of dots; the active mark
  is brass and elongated (~16px).
- Mobile: the scroll itself is the affordance — replaced by a mono index
  `03 / ∞` bottom-right.

---

## §07 — Screen One

**The first thing they see is their own potential lock screen.**

No hero copy, no nav bar, no cookie banner in the way. The page opens *as* a lock
screen — a full-bleed wallpaper with the real iOS overlay on top — and invites a
TikTok scroll to the next one. One job on this screen: feel something, then send
it to your phone.

The clock reads `9:41` everywhere by convention (the time Apple sets every device
to in product shots). Keep it — it reads as "phone" instantly and no one
questions it.

### Mobile behaviour (< 900px)

- `100dvh` panels, `scroll-snap-type: y mandatory` — one wallpaper per panel.
- Panel 1 fully above the fold on load; only the wordmark (62% opacity, top-left)
  and a soft scroll-hint chevron sit over it. The chevron is removed permanently
  after the first scroll event.
- CTA pill "Send it to my phone" is pinned and never scrolls away; 120px bottom
  scrim behind it.
- Tap the wallpaper *or* the CTA → capture sheet at ~60% height; wallpaper dims
  behind it. On submit it becomes "It's in your inbox" and the 3-question profile
  quiz begins inline.
- The reel alternates opposite worlds — Stoic, then Soft Life, then Scripture —
  so anyone sees themselves within two swipes.
- Mono index `01 / ∞` bottom-right instead of dots.

### Desktop behaviour (≥ 900px)

- Viewport-height 50 / 50 split; the page itself does not scroll on this screen.
- **Left 50%:** the same snap-scroll wallpaper reel, contained, with vertical
  brass scroll dots on its inner edge and the CTA pinned bottom-left.
- **Right 50%:** `--surface` ground, "Browse by theme", a 3-column card grid of
  the six worlds.
- Hovering a theme card cross-fades the left reel to that world (260ms). Clicking
  scrolls the reel into it.
- The right panel scrolls internally if themes overflow; the left panel stays
  put.
- 720–900px: mobile layout with wider gutters. Breakpoint: 900px.

### Reel model (decided 2026-09-08)

**Single full-bleed TikTok panels**, one wallpaper per panel. The "pairing" idea
from the earlier strategy brief is handled as an **alternating reel** — Stoic →
Soft Life → Scripture → … — not literal side-by-side pairs. `01_strategy_brief.md`
and `02_audience_transformation_profiles.md` have been updated to match.

---

## §08 — The six worlds

**One chrome. Six aesthetic worlds inside it.**

Each preset profile gets a self-contained visual world: a palette, a surface
texture, a display face and a voice. Worlds appear in wallpaper art,
profile-segmented email, and the profile's widget skin. They never touch the
chrome — no world colour on a button, a link or the nav. A visitor is routed to
one world by the 3-question quiz after capture; until then the reel alternates
them.

| World | Profile — feeling | Palette | Texture / display face | Words |
|---|---|---|---|---|
| **Stoic** | Marcus, 24 — resolve | obsidian `#0C0D0F` · steel `#3A3F45` · bone `#C9C6BE` | matte concrete grain / condensed caps | forged · locked in · earned · no one's watching |
| **Soft Life** | Sarah, 19 — possibility | blush `#F3D9DA` · cream `#FBF4EC` · warm taupe `#C9AE97` | soft paper grain / light humanist | bloom · era · intentional · becoming |
| **Scripture** | Pastor James, 42 — steadiness | deep navy `#131A2B` · parchment `#EFE7D3` · gold leaf `#B8924A` | linen + gilt edge / transitional serif | the Word · carry · stand · armor |
| **Builder** | Jerome, 28 — momentum | black `#0A0A0A` · ink `#16181C` · gold `#C79A3E` | carbon fibre, thin rule / tight grotesk | build · execute · next chapter · in silence |
| **Aesthetic** | Grace, 16 — ease | lilac `#E4DEF3` · mint `#DCEEE4` · petal `#F6DDE8` | soft gradient mesh / rounded sans | vibe · glow · cozy · it's giving |
| **Rebuild** | Diane, 34 — strength | sage `#C4CDBE` · clay `#D8B9A5` · warm white `#F4EFE8` | watercolour wash / quiet old-style serif | carried · grace · still here · rebuild |

Grace won't pay — but she's the organic engine, so her world gets the same craft
as any other. Her mother is Diane; her older sister is Sarah. Design for the
share.

---

## §09 — Motion & imagery

**Motion you feel, not motion you watch.**

### Motion

| Moment | Duration | Curve | Notes |
|---|---|---|---|
| Scroll between wallpapers | OS native | `y mandatory` snap | only the incoming message animates |
| Message settle | 400ms | ease-out | opacity 0→1, scale 1.02→1; once per panel as it lands |
| Scroll-hint chevron | 2s loop | ease-in-out | 6px bob; removed permanently after first scroll |
| Capture sheet rise | 320ms | `cubic-bezier(.32,.72,0,1)` | backdrop fades 200ms linear |
| Theme card → left reel | 260ms | ease | cross-fade only, no slide |
| "It's in your inbox" | 200ms | ease-out | single 0.98 scale pulse on the phone image |

`prefers-reduced-motion`: no bob, no scale, no pulse. The sheet appears with a
120ms fade. Snap scrolling stays — it's navigation, not decoration.

### Wallpaper art direction

- Export at 1290×2796 (iPhone 15/16 Pro), safe down to 1170×2532. Ship @3x.
- **Safe zones:** nothing essential in the top 320px (clock & date) or bottom
  200px (buttons & home bar). The centre 1000px band is the message zone.
- **Type & texture only** — no stock sunrises, mountains, lone wolves or
  motivational-poster photography. The texture is the differentiator between
  worlds.
- One line, ≤6 words, in the world's display face — never the chrome font.
- Always a 0–35% vertical scrim top and bottom so the iOS overlay holds on any
  wallpaper.
- Every wallpaper ships with a matching 1080×1920 share-card crop, wordmark
  centred at the bottom.

---

## §10 — Beyond the website

**The chrome is constant. The world skins the content.**

Every surface after the website inherits the same rule: Schibsted Grotesk + IBM
Plex Mono, warm neutrals, brass as a trace. The user's profile world colours only
the content inside — the affirmation, the quote card, the circle badge.

| Surface | Treatment |
|---|---|
| **Home-screen widget** | Neutral card, chrome type. Affirmation text tinted in the user's world colour. Streak count in semantic colour. Like + share are two hairline glyphs. |
| **Push notifications** | Plain system styling. Body copy in the profile voice, not the chrome voice. Swipe: heart to save, share to generate the branded card. |
| **SMS** | No branding at all. Pure text, under 5 seconds to read, no link, no CTA. The restraint *is* the brand on this channel. |
| **Email (Beehiiv)** | Chrome layout: warm paper, one column, wordmark in the footer. One designed quote card per send, in the world palette. Segmented by profile. |
| **Community (Skool)** | Wordmark + neutral shell. Each profile circle carries its world's 3-colour strip as its only decoration. No public like counts, ever. |
| **Share card** | The one artefact that leaves the system. World-palette background, quote in the world display face, `motivationalwallpaper.com` small and centred at the bottom. Never a screenshot. |

---

## Queue

Next design passes, in order:

1. Profile quiz screen (3 questions, identity-language answers, no progress bar)
2. Gallery / browse
3. Profile home (streak, today's micro-action, favourites)
4. Widget + email templates
5. Capture → quiz → first-morning flow, end to end
