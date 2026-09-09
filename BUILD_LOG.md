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
| Data | **Firebase Firestore**, project `motivewallpaper-220e4`, collection `survey_responses`, Admin SDK only (`src/lib/firebase.ts`). Rules **deny all client access**. |
| Other deps | `@astrojs/sitemap` 3.7.4 (unpinned for Astro 5), `@astrojs/check` 0.9.10, `@vercel/analytics` 2.0.1 |
| Secrets | `.env` (gitignored) + Vercel env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Service-account JSON is gitignored (`*firebase-adminsdk*.json`). |

## What the site does today

**Screen One (`/`)** — opens as an iOS lock screen. Vertical snap-scroll reel of 6
wallpapers; desktop adds a theme grid on the right half.

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
| **Real-browser E2E** | Run reel → Download → capture → quiz → Welcome on the live site. Eyeball the PNG (radial gradients Stoic/Builder are approximated; display fonts load within 400ms or fall back). |
| **Vercel Node version** | Set Project Settings → Node.js Version → 22.x (matches `engines.node`). |
| **Custom domain** | `astro.config.mjs` hard-codes `site: 'https://motivationalwallpaper.com'` for canonical/sitemap. Attach the domain or update `site`. |
| **`/home?profile=…` redirect** | Quiz completion dead-ends at "Welcome". `index.astro` listens for `mw:quiz-complete` but the redirect is a TODO (brief said leave it). |
| **Admin page** | Spec'd in `admin-build-brief.md`, not built. `/admin` SSR + Basic Auth + table + CSV export over `survey_responses`. |
| **ThemeGrid labels** | Desktop grid still labels its 6 cards "Stoic / Soft Life / Scripture / Builder / Aesthetic / Rebuild". Keep, drop, or replace — undecided. |
| **Uncommitted** | `Quiz.astro`, `Reel.astro`, `api/survey.ts`, `404.astro`, `gallery.astro` (progressive save + download-target + "world" copy). |

## Deferred by design

- **Beehiiv** (email) and any **SMS** provider — until traction. Rows stamp
  `emailStatus` / `smsStatus: 'pending'` for a later migration to drain.
- **Wallpaper pipeline** — plan is to source popular wallpapers and bucket them
  by profile. Flag: scraping famous accounts is likely against their ToS and
  redistributes copyrighted images — settle sourcing (licensed / original /
  permissioned) before it ships publicly.
- Rate limiting / CAPTCHA beyond the honeypot.

## Terminology

Internally the six are **"worlds"** (`WorldKey`, the `world` DB field) — a
backend/vision concept, 1:1 with the six **character profiles** (`ProfileKey`:
marcus, sarah, james, jerome, grace, diane). **Not user-facing** — public copy
says "wallpapers" / "looks", never "world".

## History

- **2026-09-09** — Astro 4→5, `@astrojs/vercel` 7→8, `output: hybrid`→`static`,
  Node target → 22. Progressive per-step autosave (`responseId` upsert, partial
  rows for abandoned flows). Client-side wallpaper PNG export on Download. CTAs
  "Join the community" → "Download". "world" removed from user-facing copy.
- **2026-09-09** — Backend built per `backend-build-brief.md`: `POST /api/survey`,
  Firestore `survey_responses`, honeypot, `firestore.rules` deny-all,
  `design/screen-one.html` frozen.
- **2026-09-08** — Screen One front end built in Astro (`src/`), parity with the
  `design/screen-one.html` prototype.
