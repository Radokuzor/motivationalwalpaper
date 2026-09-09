# motivationalwallpaper.com — front end

A daily identity anchor on your lock screen. The wallpaper is the door: Screen One
opens *as* an iOS lock screen, captures a way to reach you, and routes you into
the engagement system.

Built with **[Astro](https://astro.build)** on the **Vercel** adapter
(`output: 'hybrid'` — every page prerenders to static HTML; only `POST
/api/survey` runs as a serverless function), interactive parts as client-side
islands, **vanilla CSS + design tokens** (no Tailwind). Survey responses are
written to **Firebase Firestore** server-side via the Admin SDK. Design system is
brand bible §04–§09.

## Run it

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # -> .vercel/output/  (static HTML for every route + the /api/survey function)
npm run preview   # serve the build locally
npm run check     # astro check — type-check .astro + <script> islands
```

> **Node 20+** (see `.nvmrc`). `astro dev` / `astro build` also run on Node 18,
> but `astro check`'s toolchain needs 20. This machine's system Node is 18.19.1;
> a local Node 20 is installed at `~/.local/node-v20/` — prefix commands with
> `PATH="$HOME/.local/node-v20/bin:$PATH"` (or `nvm use`).
>
> `@astrojs/sitemap` is pinned to `3.2.1` — newer 3.7.x breaks with Astro 4.

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

Screen One posts the completed survey **once**, from `Quiz.astro` `finish()`,
fire-and-forget (`keepalive`, one silent retry) — the "Welcome to the community!"
state renders regardless of the network.

`POST /api/survey` (`src/pages/api/survey.ts`, `prerender = false`):

1. parses JSON (`400` on bad JSON);
2. honeypot — a truthy `company` field returns `200 {ok:true}` and writes nothing;
3. validates `age` / `gender` / `life` / `inspires` against the sets derived from
   `STEPS`, plus optional `email` (regex) / `phone` (7–15 digits) — `400` on any
   miss;
4. recomputes `profile` with `routeProfile()` (**any client-sent `profile` is
   ignored**) and `world` with `worldForProfile()`;
5. writes one row to Firestore `survey_responses` via the Admin SDK — contact
   stored as `null` when absent; `emailStatus` / `smsStatus` stamped `'pending'`
   when present (Beehiiv / SMS are deferred); `createdAt` is a server timestamp;
6. returns `{ ok:true, profile, world }`.

**Env vars** (`.env` locally — gitignored, see `.env.example`; Vercel → Project
Settings → Environment Variables, all environments; Vercel Node version 20.x):

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
```

Firestore rules **deny all client access** (`firestore.rules` — apply in the
Firebase console); every write goes through the Admin SDK. Run/build on Node 20:
`PATH="$HOME/.local/node-v20/bin:$PATH" npm run dev`.

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
