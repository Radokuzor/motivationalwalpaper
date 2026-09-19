# motivationalwallpaper.com — front end

A daily identity anchor on your lock screen. The wallpaper is the door: Screen One
opens *as* an iOS lock screen, captures a way to reach you, and routes you into
the engagement system.

Built with **[Astro](https://astro.build) 5** on the **Vercel** adapter
(`output: 'static'` — every page prerenders to static HTML; only `POST
/api/survey` opts out with `prerender = false` and runs as a serverless
function), interactive parts as client-side islands, **vanilla CSS + design
tokens** (no Tailwind). Survey responses are written to **Firebase Firestore**
server-side via the Admin SDK. Design system is brand bible §04–§09.

## Run it

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # -> .vercel/output/  (static HTML for every route + the /api/survey function)
npm run preview   # serve the build locally
npm run check     # astro check — type-check .astro + <script> islands
```

> **Node 20.3+ or 22+** (Astro 5's supported range; see `.nvmrc` and
> `engines.node`). Vercel builds and runs the function on **Node 22** — set
> Project Settings → Node.js Version to 22.x to match.

## Layout

```
src/
  data/
    worlds.ts        the six worlds — SINGLE SOURCE OF TRUTH (palette, art, line, routing)
    quiz.ts          3 questions + option→profile routing (routeProfile / worldForProfile)
    seo-themes.ts    /iphone-wallpapers/<slug> route data — COPY IS PLACEHOLDER
  lib/
    firebase.ts      Firebase Admin SDK init — server-side only (reads FIREBASE_* env vars)
  scripts/
    events.ts        typed CustomEvents the Screen One islands talk through
  styles/
    tokens.css       §04 colour (light + dark), §05 type scale, radii, --face-* vars
    base.css         reset + document defaults
  layouts/
    BaseLayout.astro    <html> shell: head/meta/canonical/OG, fonts, token+base CSS
    ChromeLayout.astro  BaseLayout + warm-paper header/footer shell (content pages)
  components/
    LockScreen.astro    the iOS overlay (island, padlock, 9:41, wallpaper line, …)
    Reel.astro          the 6-panel snap-scroll reel + loop + reel chrome + island script
    CaptureSheet.astro  bottom sheet / desktop modal + email capture
    Quiz.astro          inline confirmation + 3-question flow
    ThemeGrid.astro     desktop "Browse by theme" grid (right 50%)
    Wordmark / Button / SiteHeader / SiteFooter / SkeletonNote
  pages/
    api/survey.ts                    POST /api/survey -- validate, recompute profile, write Firestore (prerender = false)
    index.astro                      Screen One  -- built (parity with design/screen-one.html)
    quiz.astro                       skeleton    (Queue #1 -- full-page quiz)
    gallery.astro                    skeleton    (Queue #2 -- browse)
    home.astro                       skeleton    (Queue #3 -- profile home)
    iphone-wallpapers/[theme].astro  SEO landing TEMPLATE -- structure done, copy stubbed, noindex
    404.astro                        on-brand not-found
public/
  favicon.svg  robots.txt
```

### Islands wiring

Screen One's parts never import each other. They dispatch/listen for the typed
CustomEvents in `src/scripts/events.ts`:

```
Reel  ──mw:open-capture──▶  CaptureSheet
CaptureSheet ──mw:capture-submit──▶  Quiz
Quiz  ──mw:quiz-complete──▶  index.astro   (TODO: redirect to /home)
ThemeGrid ──mw:world-hover / -end / -select──▶  Reel   (desktop cross-fade + scroll)
```

## What's done vs. skeleton

| Done | Skeleton (structure only, later pass) |
|---|---|
| Screen One (`/`) — full parity with `design/screen-one.html` | `/quiz` full-page quiz |
| Design tokens + component layer from §04–§09 | `/gallery` browse |
| SEO scaffold: canonical/OG, sitemap, robots, FAQ JSON-LD, 404 | `/home` profile home |
| `/iphone-wallpapers/*` route shape (6 themes) | `/iphone-wallpapers/*` real keyword copy |

## Backend

Screen One saves the survey **progressively** — `Quiz.astro` fires a
fire-and-forget `POST /api/survey` at contact capture, after each quiz step, and
at completion, all carrying one client-generated `responseId`. Abandoned flows
still leave a `status: 'partial'` row. The "Welcome to the community!" state
renders regardless of the network. The capture-sheet submit ("Download") also
renders the on-screen wallpaper to a PNG and downloads it (`src/scripts/wallpaper.ts`).

`POST /api/survey` (`src/pages/api/survey.ts`, `prerender = false`):

1. parses JSON (`400` on bad JSON);
2. honeypot — a truthy `company` field returns `200 {ok:true}` and writes nothing;
3. validates the fields present against the sets derived from `STEPS` — a
   `status: 'complete'` call must have them all, a `partial` call need not — plus
   optional `email` (regex) / `phone` (7–15 digits); `400` on any invalid value;
4. recomputes `profile` with `routeProfile()` once routable (**any client-sent
   `profile` is ignored**) and `world` with `worldForProfile()`;
5. **upserts** one Firestore `survey_responses` doc per `responseId` via the Admin
   SDK — contact `null` when absent; `emailStatus` / `smsStatus` stamped
   `'pending'` when present (Beehiiv / SMS deferred); `createdAt` on first write,
   `updatedAt` every write, `completedAt` on completion;
6. returns `{ ok:true, profile, world }` (`profile`/`world` may be `null` on a
   partial).

Full status, the `survey_responses` shape, and what's left to wire live in
[`BUILD_LOG.md`](BUILD_LOG.md). Task briefs: [`backend-build-brief.md`](backend-build-brief.md)
(built), [`admin-build-brief.md`](admin-build-brief.md) (not built).

**Env vars** (`.env` locally — gitignored, see `.env.example`; Vercel → Project
Settings → Environment Variables, all environments; Vercel Node.js Version 22.x):

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
```

Firestore rules **deny all client access** (`firestore.rules` — apply in the
Firebase console); every write goes through the Admin SDK.

## Analytics

First-party, no third-party tracker, no cookies. `src/scripts/analyticsTracker.ts`
sends two beacons — `POST /api/analytics/hit` on every page load and
`POST /api/analytics/session-end` once on the way out — and
`src/lib/analytics/` enriches, classifies and stores them.

| Piece | What it does |
|---|---|
| `ua.ts` | User-agent → browser / OS / device class, plus a named bot lookup (search, AI, SEO, social, monitoring, HTTP clients, headless). |
| `sources.ts` | Referrer + UTM → channel (organic search, AI assistant, paid, social, email, referral, direct) and a display source. |
| `request.ts` | Vercel edge geo headers, and the salted daily IP hash. **Raw IPs are never stored.** |
| `bots.ts` | Three-layer bot verdict — self-declared UA, automation tells, behavioural implausibility — with the reasons kept for audit. |
| `session.ts` | Validation of the public payloads, plus all Firestore writes. |
| `query.ts` / `dashboard.ts` | Read side: range query, in-memory filtering and grouping, CSV export. |

**Collections**

- `analytics_sessions/<sessionId>` — one enriched document per visit. Written by
  the hit (identity, geo, device, campaign) and completed by session-end
  (duration, scroll, actions, page chain). Carries `expireAt` for TTL.
- `analytics_daily/<YYYY-MM-DD>` — counter-only rollups that never expire, so
  long-range totals survive session expiry.
- `page_stats`, `entry_page_stats`, `referrer_stats`, `world_stats`,
  `wallpaper_assets` — lifetime counters, as before. Bot traffic now lands in
  separate fields (`botViews`, `botDwellMs`) instead of inflating the human ones.

**Firebase setup** — already applied, recorded here so it isn't repeated:

1. **TTL policy: done** (2026-09-19). `analytics_sessions` / `expireAt`, state
   `ACTIVE` on project `motivewallpaper-220e4`. Session documents are deleted
   ~120 days after they are written; `analytics_daily` rollups are untouched and
   keep the long-range history. To inspect or change it: Firebase console →
   Firestore → Time-to-live.
2. No composite indexes are needed — every query is a single-field range plus an
   `orderBy` on that same field.

**Dashboards** (all Basic Auth, `noindex`):

- `/admin/traffic` — sessions, acquisition, landing pages, page performance, actions.
- `/admin/audience` — geography, device/browser/screen, and the bot-verdict audit
  trail with a session explorer.
- `/admin/content` — lifetime page and wallpaper totals.
- `/admin/sessions.csv` — the current filter selection as raw rows.

Filters are GET params (`range`, `from`, `to`, `quality`, `device`, `country`,
`channel`, `source`, `landing`, `campaign`, `visitor`), so any view is a URL you
can bookmark or share. `/admin/seo` redirects to `/admin/traffic`.

**The honest caveats**, both surfaced in the UI: a crawler that doesn't execute
JavaScript never reaches the tracker at all (so it is absent, not miscounted),
and "Direct" includes every visit whose referrer the browser stripped, not just
people typing the domain.

```bash
curl -X POST http://localhost:4321/api/survey -H 'content-type: application/json' -d '{
  "age":"25–34","gender":"Male","life":"I'\''m building toward something big",
  "inspires":["Steve Jobs","Alex Hormozi"],"email":"test@example.com","phone":"","company":""
}'
# -> {"ok":true,"profile":"jerome","world":"builder"}
```

## Known follow-ups (search the code for `TODO`)

- Self-host the chrome fonts (Schibsted Grotesk, IBM Plex Mono) via `@fontsource`;
  the six world display faces are still provisional stand-ins.
- Rate limiting / CAPTCHA on `POST /api/survey` beyond the honeypot.
- Wire `survey_responses` `pending` contacts to Beehiiv + an SMS provider.
- `Quiz` → redirect to `/home?profile=…` once profile home is built.
- Fill `src/data/seo-themes.ts` with real content, then drop `noindex`.
- When real wallpapers exist, move them to an Astro content collection.
- New "resurfaced backlink" pages: add an `.astro` under `src/pages/` (or a
  `[...slug].astro` catch-all backed by a collection).

## Reference

- `01_strategy_brief.md` · `02_audience_transformation_profiles.md` ·
  `03_feature_list.md` · `04_brand_bible.md`
- `design/screen-one-build-brief.md` — the Screen One spec
- `design/who-youre-becoming.html` — brand-bible visual companion
- `design/screen-one.html` — the original single-file prototype
# motivationalwalpaper
