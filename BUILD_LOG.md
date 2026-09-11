# Build log — motivationalwallpaper.com

Living status doc. What the site does today, what's verified, what's next.
Companion briefs (self-contained, paste into a fresh chat to build):

- `backend-build-brief.md` — survey capture backend *(built)*
- `admin-build-brief.md` — internal admin/export page *(not built)*
- `design/screen-one-build-brief.md` — Screen One spec *(built; `design/screen-one.html` is a FROZEN reference)*

---

## Stack (current)

| | |
|---|---|
| Framework | **Astro 5.18**, `output: 'static'` — pages prerender, SSR routes opt out with `export const prerender = false` |
| Host | **Vercel**, adapter `@astrojs/vercel` **v8** (`vercel()` from `@astrojs/vercel`) |
| Node | `engines.node` `^20.3.0 \|\| >=22.0.0`; Vercel runs **nodejs22.x**; build locally on Node 20 (`PATH="$HOME/.local/node-v20/bin:$PATH"`) or 24 |
| Data | **Firebase Firestore**, project `motivewallpaper-220e4`, collections `survey_responses`, `figure_quotes`, `wallpaper_assets`, Admin SDK only (`src/lib/firebase.ts`). Rules **deny all client access**. |
| Assets | **Firebase Cloud Storage** (`FIREBASE_STORAGE_BUCKET`), `wallpaper_assets/<id>/original.*` + `thumb.webp`. Written by `/submit` + `/api/wallpapers` via Admin SDK; browser reads use signed URLs. `storage.rules` deny-all. |
| Other deps | `@astrojs/sitemap` 3.7.4 (unpinned for Astro 5), `@astrojs/check` 0.9.10, `@vercel/analytics` 2.0.1 |
| Secrets | `.env` (gitignored) + Vercel env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Service-account JSON is gitignored (`*firebase-adminsdk*.json`). |

## What the site does today

**Screen One (`/`)** — opens as an iOS lock screen. Vertical snap-scroll reel of 6
wallpapers; desktop adds a theme grid on the right half. The reel auto-advances
one panel every 5s until the visitor drives it themselves — `touchstart` /
`wheel` / `pointerdown` on the reel (or opening capture/a category grid) kills
the timer for good; `prefers-reduced-motion` skips it entirely.

1. **CTA "Download"** (pinned on the reel) → opens the capture sheet. The reel
   re-announces the wallpaper currently on screen so the sheet knows the target.
2. **Capture sheet** — phone/email toggle, **contact optional**, visually-hidden
   `company` honeypot. Submit button reads **"Download"**.
3. **On submit:**
   - `downloadWallpaper(currentWorld)` (`src/scripts/wallpaper.ts`) renders that
     wallpaper's gradient + line to a 1170×2532 PNG and downloads it — plain
     wallpaper, no iOS chrome. Non-blocking.
   - A `responseId` (client UUID) is generated and `POST /api/survey`
     (`status: 'partial'`) fires — captures the contact even if the quiz is
     abandoned here.
   - The inline 3-step quiz starts.
4. **Quiz** — age+gender → life statement → pick-2 figures. `POST /api/survey`
   (`status: 'partial'`) fires after each step (same `responseId`, upsert).
5. **Finish** — "Welcome to the community!" renders immediately; a final
   `POST /api/survey` (`status: 'complete'`) fires fire-and-forget (one silent
   retry, errors swallowed). `mw:quiz-complete` → `index.astro`
   (**redirect to `/home?profile=…` still a TODO — flow currently dead-ends**).

### `POST /api/survey` (`src/pages/api/survey.ts`, `prerender = false`)

- Bad JSON → 400. Honeypot (`company` truthy) → `200 {ok:true}`, no write.
- Progressive **upsert**: `responseId` present → `doc(responseId).set(data, {merge:true})`;
  absent → `.add()` (fallback).
- `status: 'partial'` validates only the fields present; `status: 'complete'`
  requires them all (else 400). `email`/`phone` format-checked only if non-empty.
- `profile` + `world` recomputed server-side once routable (life statement + 2
  valid figures); any client-sent `profile` ignored.
- Row fields: `status`, `age`, `gender`, `life`, `inspires[]`, `phone`, `email`,
  `profile`, `world`, `emailStatus`/`smsStatus` (`'pending'` when contact present,
  else `null`), `source: 'screen-one'`, `userAgent`, `referer`, `createdAt` (first
  write), `updatedAt` (every write), `completedAt` (on complete).
- Beehiiv / SMS **deferred** — the `'pending'` stamps are the only hook.

### `POST /api/analytics/session-end` (`src/pages/api/analytics/session-end.ts`, `prerender = false`)

- Fired once per browser tab session, on the way out, by
  `src/scripts/analyticsTracker.ts` (mounted globally from `BaseLayout.astro`,
  skipping `/admin`/`/dashboard`) via `navigator.sendBeacon`. Stateless — no
  session is persisted server-side, the payload carries the whole page chain.
- Bad JSON → 400. Empty `pages`, or missing `startedAt`/`endedAt` → `200
  {ok:true}`, no notify. Bounces (duration <3s, ≤1 page, max scroll <10%) →
  same, silently dropped.
- Relays via `notifyTelegram()` (`src/lib/telegram.ts`, no-ops if
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` unset): site name, duration, page
  chain, max scroll %, on-site actions (download / quiz complete / email or
  phone submitted / article read — via `trackAction()`), referrer. Flags
  `/checkout` reached without `purchased: true` as "⚠️ Checkout abandoned"
  instead of "👀 Visitor session". User-controlled text (paths, referrer,
  actions) is Markdown-escaped before going into the message.

## Verified

- `npm run build` clean on Astro 5 / adapter v8; every page prerenders, only
  `/api/survey` is an on-demand function.
- `npm run check` — 0 errors / 0 warnings / 0 hints.
- API smoke (local dev vs. real Firebase): canonical → `{jerome/builder}`;
  no-contact → null-contact row; honeypot → no row; bad JSON / bad enum /
  incomplete `complete` / malformed `responseId` → 400.
- Progressive save (local dev vs. real Firebase): 4 partial posts collapse to one
  doc; `createdAt` from first, `completedAt` on finish; **abandoned flow leaves a
  `status:'partial'` row** with whatever was answered. Test rows cleaned up.
- Gradient parser handles all 6 world `art` values (4 linear, 2 radial).

## Open / next

| Item | Notes |
|---|---|
| **Production `/api/survey` check** | Confirm `FIREBASE_*` env vars are set in Vercel — otherwise every submit fails silently. `curl` the live URL, expect a row. |
| **Production Telegram check** | Set `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` in Vercel (all environments) — otherwise `notifyTelegram()` silently no-ops and no visitor-session notifications arrive. Browse the live site past the bounce threshold and confirm a Telegram message lands. |
| **Real-browser E2E** | Run reel → Download → capture → quiz → Welcome on the live site. Eyeball the PNG (radial gradients Stoic/Builder are approximated; display fonts load within 400ms or fall back). |
| **Vercel Node version** | Set Project Settings → Node.js Version → 22.x (matches `engines.node`). |
| **Custom domain** | `astro.config.mjs` hard-codes `site: 'https://motivationalwallpaper.com'` for canonical/sitemap. Attach the domain or update `site`. |
| **`/home?profile=…` redirect** | Quiz completion dead-ends at "Welcome". `index.astro` listens for `mw:quiz-complete` but the redirect is a TODO (brief said leave it). |
| **Admin page** | Spec'd in `admin-build-brief.md`, not built. `/admin` SSR + Basic Auth + table + CSV export over `survey_responses`. |
| **Category display names** | Resolved 2026-09-10 — see History. Internal `WorldKey`/`profile` values unchanged; only the user-facing `name` changed. |
| **`/gallery`** | Still the `noindex` skeleton — real per-category browsing (images, per-item copy) not built. Header "Categories" links point to `/gallery#<slug>` anchors, which exist now but the page itself is still a placeholder. |
| **Storage bucket CORS** | **Done 2026-09-11.** `motivewallpaper-220e4`'s default bucket had no CORS config, which silently blocked `fetch()`-then-download of a real photo's original file (`downloadOriginal()` in `wallpaper.ts`). Set via a one-off script using the existing Admin SDK credentials (`bucket.setCorsConfiguration`) — `GET` allowed from `motivationalwallpaper.com`, `www.`, and `localhost:4321`. Verified against the real bucket + a real download. |
| **Uncommitted** | `Quiz.astro`, `Reel.astro`, `api/survey.ts`, `404.astro`, `gallery.astro` (progressive save + download-target + "world" copy). |

## Wallpaper pipeline

**`/submit` — built.** Ungated operator page: upload images, file each under any
number of categories (the same photo can serve several, or leave it unsorted),
mark one **Preferred** per category, re-file/re-preferred/delete from a live
grid. The earlier Instagram/Apify scraper was abandoned (Reel-only feeds,
ToS/licensing) — sourcing is now manual: the operator supplies files they own
or have licensed.

- `src/pages/submit.astro` — `prerender = false`, `noindex`, robots-disallowed.
  Server-lists the latest 300 `wallpaper_assets` with signed thumb URLs.
  Category picker + re-file grid are checkbox fieldsets (not a `<select>`) so
  a wallpaper can carry multiple `worlds`; a "★ Preferred" checkbox sits
  alongside. Client JS uploads one file per request (native multi-file form
  POST still works as a no-JS fallback) and canvas-downscales anything
  > ~3.8 MB to ≤ 2960px JPEG so each body clears Vercel's ~4.5 MB serverless
  limit.
- `POST /api/wallpapers` — `multipart/form-data` (`file` ×N, `world` ×0-N
  repeated field, `preferred` `'1'`, `website` honeypot). Per file: `sharp`
  decode/validate (jpeg/png/webp/avif, short edge ≥ 500px) → sha1-16 id →
  `thumb.webp` (640w) + 64-bit dHash → original + thumb to Storage
  `wallpaper_assets/<id>/` → upsert `wallpaper_assets/<id>`. Identical bytes
  upsert in place. JSON result to fetch callers, 303 → `/submit` otherwise.
- `PATCH /api/wallpapers/:id` `{ worlds?, preferred? }` (either/both) — re-file
  and/or re-preferred (`status` follows `worlds`). `DELETE /api/wallpapers/:id`
  — remove doc + Storage folder.
- **`GET /api/wallpapers`** — public read side (no auth; the catalog itself
  isn't sensitive), consumed client-side so an upload shows up on the live
  site without a rebuild: `?world=<key>` → that category's assets, preferred
  first; `?hero=1` → one photo per world (freshest `preferred` doc that
  includes it) as `{thumbUrl, originalUrl}`, used by Reel/ThemeGrid/
  CategoryGrid/PNG export to replace the CSS gradient. Firestore reads are
  equality/array-contains only + in-memory sort, so no composite index needed.
- Helpers in `src/lib/wallpaperAssets.ts`; `src/lib/firebase.ts` now also exports
  `bucket`. Storage/Firestore rules stay deny-all — browser `<img>`s use
  short-lived v4 signed URLs minted server-side.
- `wallpaper_assets` doc: `status` `'sorted'|'unsorted'`, `worlds: WorldKey[]`,
  `preferred: boolean`, `source:'submit'`, `sha`, `originalFilename`,
  `license:'owner-supplied'`, `width`/`height`/`aspect`, `bytes`, `format`,
  `phash`, `storageOriginal`, `storageThumb`, `createdAt`/`updatedAt`.

**Hero photos — built 2026-09-11, no text on real photos.** A `preferred`
asset becomes its world's real wallpaper on `Reel.astro` panels (+ loop
clones) and `ThemeGrid.astro` cards, replacing the CSS gradient — `--art`
swaps to the signed `thumbUrl` once `src/scripts/hero.ts`'s `getHeroMap()`
resolves (pure progressive enhancement; gradient stays until/unless it
resolves). A real photo is used **as-is, no quote stamped on it** — the
`.wp-line`/`.preview-line` text is hidden (`.has-photo` class) wherever a
hero photo is showing; only a still-gradient world keeps its line.
`downloadWallpaper()` hands over the hero's **original**-quality file
untouched (`downloadOriginal()` — fetch → blob → save, no canvas at all) —
only a world with no photo yet falls back to the gradient+line canvas
render.

**`CategoryGrid.astro` browses real photos, not text variants.** Opens
instantly with the world's 12 gradient/quote placeholder tiles, then
`GET /api/wallpapers?world=<key>` resolves and — if that category has any
real photos, preferred or not — replaces them with one tile per photo, no
text, however many exist (1, 3, 20…). Tapping a tile hands over *that exact
file* via `mw:reel-world`'s new optional `asset: {id, originalUrl}`
(`src/scripts/events.ts`), which `CaptureSheet.astro` downloads with
`downloadOriginal()` instead of re-deriving the world's hero — important
once a category has more than one photo and a non-preferred one is tapped.
A category with zero real photos still shows the 12 placeholder tiles.

**Not built:** per-world/per-category manual tile ordering beyond
preferred-first; a way to give an individual photo its own caption/line.

## SEO & blog

**Built 2026-09-11.** `/blog` — a content collection (`src/content.config.ts`,
Astro 5 content-layer `glob` loader over `src/content/blog/*.md`) of
motivation/self-help articles, indexed and in the sitemap. Not wallpaper
marketing copy — genuine, specific writing on discipline, self-love, faith,
entrepreneurship, healing, and mindset, each with an optional `relatedWorld`
that drives a soft in-article CTA to `/gallery#<slug>`.

- `/blog` — index, lists all non-draft posts newest-first.
- `/blog/<slug>` — post page (`src/pages/blog/[slug].astro`). Renders the
  Markdown body inside `ChromeLayout`, plus JSON-LD: `Article` +
  `BreadcrumbList` always, `FAQPage` when the post's frontmatter has `faqs`
  (AI Overview / citation bait — see `01_strategy_brief.md` #2).
- 6 posts shipped: self-discipline, self-love, Bible verses for anxiety,
  staying motivated building a business, healing after rock bottom, do
  affirmations work, morning routines. 3 of the 6 carry `faqs`.
- `SiteHeader.astro` gained a **Blog** tab (Home / Blog / About).
- `/rss.xml` (`src/pages/rss.xml.ts`, `@astrojs/rss`) — blog feed; linked from
  `<head>` via `rel="alternate"` in `BaseLayout`.

**Sitemap.** `astro.config.mjs`'s sitemap `filter` flipped from an allow-list
(only `/`) to a deny-list of known-`noindex` prefixes (`/home`, `/gallery`,
`/quiz`, `/submit`, `/iphone-wallpapers`, `/api`, `/404`) — so `/`, `/about`,
`/blog`, and every `/blog/*` post are now listed automatically, and any new
indexable page is included without touching this file again. As each
skeleton page (`/gallery`, `/iphone-wallpapers/*`) earns real content and
drops its `noindex` meta tag, drop its prefix from this list too.

**Structured data / social.** `index.astro` carries sitewide `Organization` +
`WebSite` JSON-LD (`@graph`) for entity resolution (brief's "Gemini
optimization" item). `BaseLayout` gained `og:image`/`twitter:image` (previously
missing entirely) defaulting to `public/og/default.png` — a generated 1200×630
share card (brand tokens, no font dependency issues since it's rasterized via
`sharp`+SVG, source script was scratch/not committed) — overridable per-page
via the new `image` prop (threaded through `ChromeLayout` too).

**AI discoverability.** `public/llms.txt` — site summary + key page/article
links, following the emerging llms.txt convention some AI crawlers/agents
check for.

**Not done / open:**
- Google Search Console + Bing Webmaster Tools verification (needs the
  domain owner to add a verification meta tag or DNS record — can't fabricate
  a verification code here).
- Real per-post OG images (all posts currently share the one default card).
- `/gallery` and `/iphone-wallpapers/*` are still `noindex` skeletons; once
  built for real, remove `noindex` and drop their prefix from the sitemap
  filter above.
- Pinterest / TikTok / Reels distribution (brief's other traffic-growth
  levers) — outside this pass, no code involved.

## Deferred by design

- **Beehiiv** (email) and any **SMS** provider — until traction. Rows stamp
  `emailStatus` / `smsStatus: 'pending'` for a later migration to drain.
- Rate limiting / CAPTCHA beyond the honeypot.

## Terminology

Internally the six are **"worlds"** (`WorldKey`, the `world` DB field) — a
backend/vision concept, 1:1 with the six **character profiles** (`ProfileKey`:
marcus, sarah, james, jerome, grace, diane). **Not user-facing** — public copy
says "wallpapers" / "looks", never "world".

## History

- **2026-09-11** — Telegram visitor-session notifier: `src/lib/telegram.ts`
  (`notifyTelegram`, server-only, no-ops if `TELEGRAM_BOT_TOKEN`/
  `TELEGRAM_CHAT_ID` unset) + `POST /api/analytics/session-end`
  (`src/pages/api/analytics/session-end.ts`) relays a visitor's page chain,
  duration, max scroll, on-site actions, and referrer to Telegram, flagging
  `/checkout` reached without a purchase as "Checkout abandoned"; bounces
  (<3s, ≤1 page, <10% scroll) are dropped. Client side is
  `src/scripts/analyticsTracker.ts`, mounted globally from
  `BaseLayout.astro` — since this is a static multi-page site (no client
  router), "route change" means "new page load": session id/start/referrer/
  page-chain/action list live in `sessionStorage` and carry across loads in
  the same tab, with a same-origin link-click hook that closes out the
  current page and flags the session as "continuing" *before* unload, so the
  `pagehide`/`visibilitychange` beacon only actually fires once, on
  whichever load turns out to be the session's last one. `trackAction()` is
  wired into the existing flows that already exist (no new features added
  to reach them): wallpaper download + email/phone capture in
  `CaptureSheet.astro`, quiz completion in `Quiz.astro`, blog article reads
  in `blog/[slug].astro`. `/admin` and `/dashboard` paths are excluded
  (neither exists yet). No checkout flow exists yet either — `markPurchased()`
  is exported from the tracker for whenever one is built to call on success.

- **2026-09-11** — `/submit` reworked for multi-category tagging: `world`
  (single key) → `worlds: WorldKey[]` end to end (`wallpaperAssets.ts`'s
  `normalizeWorlds`, both API routes, the submit page's checkbox UI). Added a
  **Preferred** flag per asset and a public `GET /api/wallpapers` (list by
  world, `?hero=1` map) so an upload is visible on the live site immediately.
  Wired preferred photos in as each world's real hero image on the reel/
  theme grid, and set the Storage bucket's CORS config so a real photo's
  original file can actually be fetched for download (see "Hero photos" /
  "Storage bucket CORS" under Wallpaper pipeline) — new `src/scripts/hero.ts`.
  Added the reel auto-advance timer (see Screen One, above).

  **Revised same day**, per explicit direction that real photos won't need
  any text stamped on them: dropped the canvas photo-compositing path
  entirely (`drawCover`/`isCorsClean`/`loadImage` in `wallpaper.ts` deleted —
  a real photo now downloads via `downloadOriginal()`, a plain fetch → blob →
  save, unmodified) and hid the quote line wherever a hero photo shows
  (`.has-photo` on the reel panel / hover preview). Reworked
  `CategoryGrid.astro` from "12 fixed text-variant tiles" to "one tile per
  real uploaded photo" once any exist for that category — tapping a tile now
  carries a specific `asset` through `mw:reel-world` (`events.ts`) so
  `CaptureSheet.astro` downloads exactly the photo that was tapped, not just
  the world's hero. A category with no real photos yet is unaffected — still
  12 gradient/quote placeholder tiles.

  Smoke-tested end to end against the real `motivewallpaper-220e4` project
  (multi-world upload, hero map, PATCH validation, category-grid photo tiles,
  a real browser download landing as `.jpg` not `.png`, delete) — test rows
  cleaned up after each run.

- **2026-09-10** — Category display names renamed for relatability: Stoic→Gym,
  Soft Life→Self Love, Scripture→Faith, Builder→Entrepreneurship,
  Rebuild→Healing (Aesthetic unchanged). Only `World.name` changed — `key`,
  `slug`, `profile`, and quiz routing untouched. Added a 7th bonus category,
  **Anime & Sci-Fi** (`key: 'anime'`), browsable everywhere (ThemeGrid,
  CategoryRail, CategoryGrid, gallery) but excluded from the reel and from
  quiz routing (`profile` omitted, `inReel: false` — new `REEL_WORLDS`/
  `REEL_ORDER` in `src/data/worlds.ts` filter it out; `Reel.astro` updated to
  read `REEL_WORLDS`). Added its display face (Orbitron) to the Google Fonts
  request and `--face-anime` token, plus matching inflections in
  `LockScreen.astro` and `wallpaper.ts`'s canvas export.

  Added a shared header nav (`SiteHeader.astro`: wordmark + Home/About tabs +
  category quick-links) — already used site-wide via `ChromeLayout` on
  content pages; now also mounted inside `ThemeGrid.astro` (desktop, right
  pane only) and `CategoryGrid.astro` (mobile grid sheet only, hidden
  ≥900px so it isn't duplicated). Category links navigate to `/gallery#slug`
  everywhere except Screen One, where a small script hijacks the click to
  emit `mw:category-open` and open the grid in place instead. Built
  `src/pages/about.astro` (plain `ChromeLayout` page) as the About tab's
  destination. Added `id={w.slug}` anchors to `/gallery` tiles.

- **2026-09-09** — `/submit` built: ungated operator page to upload wallpapers
  and file them under the six worlds, `POST` + `PATCH`/`DELETE /api/wallpapers`,
  `wallpaper_assets` collection + Cloud Storage (originals + signed-URL thumbs),
  `sharp` dep, `storage.rules` deny-all, `FIREBASE_STORAGE_BUCKET` env var. An
  earlier same-day Instagram/Apify scraper attempt was scrapped (Reel-only feeds
  + licensing); `APIFY_TOKEN` removed.
- **2026-09-09** — Astro 4→5, `@astrojs/vercel` 7→8, `output: hybrid`→`static`,
  Node target → 22. Progressive per-step autosave (`responseId` upsert, partial
  rows for abandoned flows). Client-side wallpaper PNG export on Download. CTAs
  "Join the community" → "Download". "world" removed from user-facing copy.
- **2026-09-09** — Backend built per `backend-build-brief.md`: `POST /api/survey`,
  Firestore `survey_responses`, honeypot, `firestore.rules` deny-all,
  `design/screen-one.html` frozen.
- **2026-09-08** — Screen One front end built in Astro (`src/`), parity with the
  `design/screen-one.html` prototype.
