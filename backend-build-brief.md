# Backend Build Brief — survey capture

Self-contained brief for a **fresh chat session**. Open a new Claude Code window
in this repo and paste the "Prompt to paste" block at the bottom, or say:
*"Read `backend-build-brief.md` and build it."*

---

## Goal

Screen One's profile survey collects answers and calls
`emit(MW.quizComplete, …)` — **nothing is persisted, no network call is made.**
Wire it to a backend:

- **Host:** Vercel
- **Store:** Firebase Firestore, written server-side only via the Admin SDK
- **Channel tools (Beehiiv / SMS):** **NOT NOW.** Stamp a `pending` status on each
  contact so a later migration can pick them up. Do **not** integrate Beehiiv or
  any SMS provider in this pass.

---

## Read first (in this repo)

| File | Why |
|---|---|
| `README.md` | Stack, run commands, the **Node 20** note (`~/.local/node-v20/bin`), `src/` layout |
| `src/data/quiz.ts` | `STEPS`, `SurveyAnswers`, `routeProfile()`, `worldForProfile()` — import these in the API route |
| `src/components/Quiz.astro` | `finish()` is where the POST goes |
| `src/components/CaptureSheet.astro` | the capture form — add the honeypot field here; it already carries `phone`/`email` into the flow via `mw:capture-submit` |
| `src/scripts/events.ts` | `mw:capture-submit` / `mw:quiz-complete` payload shapes |
| `src/pages/index.astro` | listens for `mw:quiz-complete` (has a redirect TODO — leave it) |
| `astro.config.mjs` | `output: 'static'` today → becomes `'hybrid'` + Vercel adapter |

---

## Current data shape

`src/data/quiz.ts` → `SurveyAnswers`:

```ts
{
  phone?: string      // optional; '' if unused. loose format: 7–15 digits
  email?: string      // optional; '' if unused
  age: string         // '13–17' | '18–24' | '25–34' | '35–44' | '45–54' | '55+'
  gender: string      // 'Male' | 'Female'
  life: string         // one of the 4 STEPS[1].options[].label strings
  inspires: string[]   // exactly 2 names from STEPS[2].options[].name
}
```

Derived **server-side**: `profile` via `routeProfile()` ∈
`marcus|sarah|diane|james|jerome|grace`; `world` via `worldForProfile()`.

---

## Steps

### 1. Astro → Vercel SSR (`hybrid`)

- `npm i @astrojs/vercel@^7 firebase-admin`
  (repo is Astro `^4.16` → adapter **v7**, import path `@astrojs/vercel/serverless`.
  Do **not** run `astro add vercel` — it pulls v8, which needs Astro 5.)
- `astro.config.mjs`: set `output: 'hybrid'`, add `adapter: vercel()`. Keep
  `@astrojs/sitemap` pinned at `3.2.1` (README: newer breaks with Astro 4).
- Under `hybrid` every existing page stays static automatically; only the new API
  route opts out (`export const prerender = false`).
- Run everything on Node 20: `PATH="$HOME/.local/node-v20/bin:$PATH" npm run build`.

### 2. Firebase

- Create a Firebase project + Firestore database (production mode).
- Firestore rules — **deny all client access** (every write goes through the Admin
  SDK):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} { allow read, write: if false; }
    }
  }
  ```
- Project Settings → Service Accounts → **Generate new private key** → gives
  `project_id`, `client_email`, `private_key`.
- `.env` (already gitignored) for local dev:
  ```
  FIREBASE_PROJECT_ID=...
  FIREBASE_CLIENT_EMAIL=...
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
  ```
- The same three vars in Vercel → Project Settings → Environment Variables (all
  environments). Set the Vercel project's Node version to **20.x**.

### 3. `src/lib/firebase.ts`

```ts
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });

export const db = getFirestore(app);
```

### 4. `src/pages/api/survey.ts`

- `export const prerender = false;`
- `export const POST: APIRoute = async ({ request }) => { … }`:
  1. `await request.json()` in try/catch → `400` on bad JSON.
  2. **Honeypot:** if `body.company` is truthy → return `{ ok: true }` `200` and
     write nothing.
  3. **Validate** (derive the allowed sets from `STEPS`, don't hard-code twice):
     `age` ∈ ages, `gender` ∈ {Male, Female}, `life` ∈ life-option labels,
     `inspires` is an array of length 2 whose names are all real figure names.
     `phone`/`email` optional; a non-empty `email` must pass a basic regex; a
     non-empty `phone` must have 7–15 digits. Failure → `400 { ok:false, error }`.
  4. `const profile = routeProfile({ age, gender, life, inspires })` —
     **recompute; ignore any `profile` the client sends.**
  5. `const world = worldForProfile(profile)`.
  6. `db.collection('survey_responses').add({ age, gender, life, inspires,
     phone: phone || null, email: email || null, profile, world,
     emailStatus: email ? 'pending' : null, smsStatus: phone ? 'pending' : null,
     source: 'screen-one', userAgent: request.headers.get('user-agent') ?? null,
     referer: request.headers.get('referer') ?? null,
     createdAt: FieldValue.serverTimestamp() })`.
  7. Return `{ ok: true, profile, world }` `200`.
- Small `json(data, status)` helper → `new Response(JSON.stringify(data), {status,
  headers: { 'content-type': 'application/json' }})`.

### 5. Client wiring

- `CaptureSheet.astro`: add a visually-hidden honeypot to the form and carry its
  value into the flow:
  ```html
  <input type="text" name="company" id="mw-company" tabindex="-1"
         autocomplete="off" aria-hidden="true"
         style="position:absolute;left:-9999px;opacity:0;height:0;width:0" />
  ```
  Read it on submit; pass it through `mw:capture-submit` (extend the event detail)
  or stash it on a module variable Quiz can read.
- Make sure `answers` ends up with `phone`, `email`, and `company`. `Quiz.astro`
  already copies `detail.phone` / `detail.email` from `mw:capture-submit` into
  `answers`; add `company` alongside.
- `Quiz.astro` `finish()`: **fire-and-forget** POST, non-blocking:
  ```ts
  fetch('/api/survey', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      age: answers.age, gender: answers.gender, life: answers.life,
      inspires: answers.inspires,
      phone: answers.phone ?? '', email: answers.email ?? '',
      company: answers.company ?? '',
    }),
    keepalive: true,
  }).catch(() => {});
  ```
  The "Welcome to the community!" state must render regardless of the network
  result. One silent retry is fine; a spinner or error gate is not.

### 6. Freeze the standalone prototype

`design/screen-one.html` was hand-synced with the Astro components over several
rounds and **cannot run a backend**. Add this as the very first line:

```html
<!-- FROZEN visual reference. Source of truth is the Astro app in src/. Do not wire to the API. -->
```

Do not change its behaviour otherwise.

### 7. Docs

- Update `README.md`: new `src/lib/` and `src/pages/api/`, the `output: 'hybrid'`
  + adapter line, the env vars, and a short "Backend" run note.
- Leave `design/screen-one-build-brief.md` untouched.

---

## Decisions already made (do not relitigate)

- **Vercel + Firebase now; Beehiiv + SMS deferred** until there's traction — just
  stamp `emailStatus` / `smsStatus: 'pending'`.
- Survey contact is **optional** — store rows with `phone: null, email: null` too.
- **One POST at survey completion** with the full payload — not one per step, not
  at capture time.
- **Non-blocking** — the UX never waits on the network.
- **Recompute `profile` server-side.**

---

## Out of scope

- Beehiiv / any ESP, any SMS provider
- Auth, user accounts, the `/home` profile screen, reading data back into the site
- Rate limiting / CAPTCHA beyond the honeypot (note it as a follow-up)
- Analytics dashboards, admin views

---

## Test

```bash
PATH="$HOME/.local/node-v20/bin:$PATH" npm run dev
curl -X POST http://localhost:4321/api/survey -H 'content-type: application/json' -d '{
  "age":"25–34","gender":"Male",
  "life":"I'\''m building toward something big",
  "inspires":["Steve Jobs","Alex Hormozi"],
  "email":"test@example.com","phone":"","company":""
}'
# → {"ok":true,"profile":"jerome","world":"builder"}  + a doc in survey_responses
```

Also: run the real survey in the browser with **no** contact → row stored with
null contact; malformed payload → `400`; honeypot filled → `200`, no row.

---

## Acceptance checklist

- [ ] `output: 'hybrid'` + `@astrojs/vercel` v7 adapter; `npm run build` passes on Node 20
- [ ] Every existing route still builds as static HTML
- [ ] `POST /api/survey` writes to Firestore `survey_responses` with a server timestamp and derived `profile` / `world`
- [ ] Client POSTs once at survey completion, fire-and-forget; "Welcome to the community!" always shows
- [ ] Optional contact honoured: null-contact rows stored; `emailStatus` / `smsStatus` = `'pending'` when a contact is present
- [ ] Server recomputes `profile`, ignoring any client-sent value
- [ ] Honeypot rejects silently; bad payloads → `400`
- [ ] Firestore rules deny all client access
- [ ] Secrets only in `.env` (gitignored) and Vercel env vars — nothing committed
- [ ] `design/screen-one.html` has the FROZEN banner and is otherwise unchanged
- [ ] `README.md` updated
- [ ] `astro check` clean

---

## Prompt to paste into the new chat

> Read `backend-build-brief.md` in this repo, then the files it lists. Implement
> it exactly: Astro → Vercel `hybrid` SSR, a `POST /api/survey` route that
> validates the survey payload, recomputes the profile with `routeProfile()`, and
> writes it to Firebase Firestore `survey_responses` via the Admin SDK. Wire
> `Quiz.astro`'s `finish()` to POST once, fire-and-forget. No Beehiiv, no SMS —
> just stamp `emailStatus` / `smsStatus: 'pending'`. Freeze `design/screen-one.html`
> with the banner. Update `README.md`. When done, run the acceptance checklist and
> report pass/fail per item.
