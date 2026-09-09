# Screen One — Build Brief

Self-contained brief for building the landing screen in a **fresh chat session**.
Open a new Claude Code window in this folder and paste the "Prompt to paste"
block at the bottom, or just say: *"Read `design/screen-one-build-brief.md` and
build it."*

---

## Read first (in this repo)

| File | What to take from it |
|---|---|
| `04_brand_bible.md` | The whole file. Especially §04 Colour (tokens), §05 Typography (scale + fonts), §06 Components (buttons, capture field, capture sheet, scroll indicator), §07 Screen One (behaviour spec), §08 The six worlds (palettes + display faces), §09 Motion. |
| `01_strategy_brief.md` | "Funnel architecture" section — where this screen sits. |
| `02_audience_transformation_profiles.md` | "Profile quiz (post-capture routing)" section — the 3 questions (also copied below). |
| `design/who-youre-becoming.html` | Static visual mockup of this screen. **Reference only — do not extend this file.** |

---

## Deliverable

- **One new file:** `design/screen-one.html`
- Single self-contained HTML file. No build step. No JS frameworks or libraries.
  Google Fonts link is allowed (Schibsted Grotesk + IBM Plex Mono). All CSS/JS
  inline.
- **Local file only. Do not publish an Artifact.**
- Mobile-first. Must also work fully on desktop (see split layout below).
- Light + dark chrome via `prefers-color-scheme` (tokens from §04). The reel
  panels are artwork with fixed colours and do **not** theme — only the chrome
  (capture sheet, quiz, wordmark) themes.
- Respect `prefers-reduced-motion` per §09.

---

## The reel content — 6 placeholder panels

No real images. Each panel is a full-bleed CSS gradient built from that world's
§08 palette, with one line of copy set in that world's display-face *feel* (use a
Google font that matches, or just weight/tracking — this is a prototype).

Order in the reel (then loop): **Stoic → Soft Life → Scripture → Builder →
Aesthetic → Rebuild**. Alternating opposite worlds so any visitor sees themselves
within two swipes.

| # | World | Gradient from (§08) | Line on the wallpaper | Overlay text |
|---|---|---|---|---|
| 1 | Stoic | obsidian `#0C0D0F` → steel `#3A3F45` | "The work is the point." | white |
| 2 | Soft Life | cream `#FBF4EC` → blush `#F3D9DA` → taupe `#C9AE97` | "You are allowed to begin again." | ink `#1B1B1C` |
| 3 | Scripture | navy `#131A2B` → `#0D1220` | "Be still. He has you." | parchment `#EFE7D3` |
| 4 | Builder | `#202227` → black `#0A0A0A` | "Build it in the quiet." | gold `#C79A3E` on white text |
| 5 | Aesthetic | lilac `#E4DEF3` → mint `#DCEEE4` → petal `#F6DDE8` | "Today gets to be soft." | ink `#3A3A3A` |
| 6 | Rebuild | sage `#C4CDBE` → clay `#D8B9A5` | "You are still here." | ink `#3A3A3A` |

Every panel needs a 0–35% vertical scrim top **and** bottom so the iOS overlay
stays readable (§09).

---

## iOS lock-screen overlay (on every panel)

Recreate in CSS, matching `design/who-youre-becoming.html`:

- Dynamic Island — black pill, top centre.
- Small lock glyph (closed padlock), centred near the top.
- Date: **"Monday, September 8"** — small, ~92% opacity.
- Time: **"9:41"** — large, ~300 weight, system font, slight negative tracking.
  (9:41 is the Apple product-shot convention. Keep it.)
- The wallpaper line (table above) — centred in the lower third, in the world's
  display feel, `text-wrap: balance`.
- Flashlight + camera round buttons, bottom left/right.
- Home indicator bar, very bottom.

---

## Mobile layout (`< 900px`)

- `100dvh` panels, `scroll-snap-type: y mandatory`, `scroll-snap-align: start` —
  one wallpaper per panel, native-feeling vertical scroll.
- Panel 1 fully visible on load. Over it, only:
  - the wordmark `motivationalwallpaper` top-left at ~62% opacity, chrome font,
    small;
  - a soft downward chevron near the bottom, gentle 6px bob (2s loop). **Remove
    it permanently after the first scroll event.**
- **Pinned CTA** — a glass pill "Send it to my phone" fixed near the bottom,
  above a ~120px bottom scrim. Never scrolls away. Present on every panel.
- Mono index bottom-right: `01 / ∞`, updating with the active panel (`02 / ∞`, …).
- Tapping the wallpaper **or** the CTA opens the capture sheet.

---

## Desktop layout (`≥ 900px`)

- Full viewport height, **50 / 50 split, page itself does not scroll.**
- **Left 50%:** the same snap-scroll reel, but contained inside the left panel
  (it scrolls, the page doesn't). Vertical scroll-dots on the panel's inner right
  edge — active dot is brass (`--accent`) and elongated. CTA pill pinned
  bottom-left of this panel.
- **Right 50%:** `--surface` ground, padding, a small uppercase label
  "Browse by theme", then a **3-column grid of 6 theme cards** (9:16), one per
  world, each a mini gradient with the world name bottom-left.
  - Hovering a theme card **cross-fades the left reel** to that world (260ms).
  - Clicking a card scrolls the left reel to that world's panel.
  - Right panel scrolls internally if content overflows; left panel stays put.
- 720–900px: use the mobile layout with wider side gutters.

---

## Capture sheet

- Mobile: rises from the bottom (~60% height), 20px top corners, grab handle,
  `--surface` bg, backdrop dims the wallpaper behind it.
- Desktop: same content as a centred modal with a dimmed backdrop.
- Motion: rise 320ms `cubic-bezier(.32,.72,0,1)`, backdrop fade 200ms.
- Contents:
  - Heading: **"Where should we send it?"**
  - Helper: *"Lands in your inbox in a few seconds."*
  - Email field (type=email, real `<label>`, placeholder `you@email.com`).
    Focus = brass border + 3px `--accent-soft` glow.
  - Full-width primary button: **"Send my wallpaper"** (rests on `--ink`, fills
    brass on hover).
  - Microcopy, faint, centred: *"No account. No spam. Just the wallpaper."*
- **No real submission.** On submit (basic email validity check only), the sheet
  content swaps to the confirmation + quiz below.

---

## Confirmation + inline quiz (after submit)

Sheet/modal content becomes:

- Heading: **"It's in your inbox."**
- Sub: *"Two quick questions so tomorrow's fits you better."*
- Then the 3 questions, one at a time. Selecting an option advances to the next.
  No progress bar, no skip, no back. Options are identity statements, not A/B/C/D.

**Q1 — "What does a good morning look like for you?"**
- Quiet and intentional — coffee, stillness
- Moving — gym, a walk, first task done before 8
- Soft — slow start, no rush
- Locked in — review the goals, set the day

**Q2 — "What do you most want to feel more of?"**
- Peace and purpose
- Discipline and edge
- Confidence and self-love
- Momentum and progress

**Q3 — "What's pulling at you right now?"**
- I'm rebuilding after something hard
- I'm building toward something big
- I'm trying to feel like myself again
- I'm trying to be who I know I'm capable of being

After Q3: **"You're all set."** / *"Check your inbox — your first wallpaper is
waiting."* (No routing logic needed in this prototype; just capture the 3
answers in a JS object and log them.)

---

## Motion (from §09 — implement these, skip the rest)

| Moment | Duration | Curve |
|---|---|---|
| Message settles as a panel lands | 400ms | ease-out (opacity 0→1, scale 1.02→1), once per panel |
| Scroll-hint chevron | 2s loop | ease-in-out, 6px bob, removed after first scroll |
| Capture sheet rise | 320ms | `cubic-bezier(.32,.72,0,1)` |
| Backdrop fade | 200ms | linear |
| Theme card → left reel cross-fade | 260ms | ease |

`prefers-reduced-motion: reduce` → no bob, no scale; sheet appears with a 120ms
fade; snap scroll stays.

---

## Acceptance checklist

- [ ] Opens on panel 1 as a lock screen, no chrome except wordmark + chevron + CTA
- [ ] Vertical snap-scroll through all 6 panels, then loops; feels native on mobile
- [ ] Chevron disappears for good after the first scroll
- [ ] Mono index updates with the active panel on mobile
- [ ] CTA pill stays pinned on every panel; opens the capture sheet
- [ ] Tapping a wallpaper also opens the capture sheet
- [ ] Capture sheet rises with the right curve; backdrop dims the wallpaper
- [ ] Invalid email is blocked with an inline message (no alert())
- [ ] On submit, content swaps to "It's in your inbox" + Q1
- [ ] Q1→Q2→Q3 advance on selection; end on "You're all set"; answers in a JS object
- [ ] ≥900px: 50/50 split, page doesn't scroll, left reel scrolls independently
- [ ] Desktop scroll-dots track the active panel; active dot is brass + elongated
- [ ] Hovering a theme card cross-fades the left reel; clicking scrolls to it
- [ ] Chrome respects light/dark; reel panels stay fixed-colour
- [ ] `prefers-reduced-motion` honoured
- [ ] Keyboard: CTA, theme cards, sheet field/button, quiz options all focusable with a visible ring
- [ ] Single file, no external JS, no console errors

---

## Out of scope (do not build)

- Real email delivery / backend
- Real wallpaper images or downloads
- Actual profile-routing logic from the quiz
- Production framework / SEO scaffolding (Next.js etc.) — that's a separate later
  decision, not this prototype
- Any other screens (quiz-as-full-page, gallery, profile home)

---

## Prompt to paste into the new chat

> Read `design/screen-one-build-brief.md` in this folder, then read the files it
> points to (`04_brand_bible.md`, `01_strategy_brief.md`, and the quiz section of
> `02_audience_transformation_profiles.md`). Build `design/screen-one.html`
> exactly to that brief: a single self-contained HTML file, mobile-first, working
> on desktop, local file only — do not publish an Artifact. When done, list which
> acceptance-checklist items pass and which don't.
