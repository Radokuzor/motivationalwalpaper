# Admin build brief — survey data viewer + export

Self-contained brief for a **fresh chat session**. Open a new Claude Code window
in this repo and say: *"Read `admin-build-brief.md` and build it."*

---

## Goal

An internal page to see who has come through the survey and which character
profile they routed to, so custom motivation content can be sent later. Read-only
view + CSV export over Firestore `survey_responses`. Password-gated.

- **Route:** `/admin` (SSR) + `/admin/responses.csv` (export)
- **Auth:** HTTP Basic Auth against `ADMIN_PASSWORD` (+ optional `ADMIN_USER`)
- **Out of scope:** editing rows, auth providers/sessions, pagination, charts

---

## Read first (in this repo)

| File | Why |
|---|---|
| `BUILD_LOG.md` | Current stack + the `survey_responses` document shape |
| `src/pages/api/survey.ts` | How rows are written (progressive upsert, `status`, fields) |
| `src/lib/firebase.ts` | `db` (Admin SDK); env read as `{ ...process.env, ...import.meta.env }` |
| `src/data/quiz.ts` | `ProfileKey` |
| `src/data/worlds.ts` | `WorldKey` |
| `astro.config.mjs` | `output: 'static'`; SSR routes need `export const prerender = false` |
| `.env.example` / `public/robots.txt` | Where to add the admin env var / disallow rule |

---

## `survey_responses` document shape

Doc ID = client `responseId` (UUID or `r-<ts>-<rand>`). One row per response,
upserted at capture, after each quiz step, and at completion. Legacy rows (auto
IDs, no `status`/`updatedAt`/`completedAt`) may exist.

| field | type |
|---|---|
| `status` | `'partial' \| 'complete'` (may be absent on legacy rows) |
| `age` | string \| null |
| `gender` | `'Male' \| 'Female'` \| null |
| `life` | string \| null |
| `inspires` | string[] (0–2) |
| `phone` / `email` | string \| null |
| `profile` | `'marcus'\|'sarah'\|'james'\|'jerome'\|'grace'\|'diane'` \| null |
| `world` | `'stoic'\|'soft'\|'scripture'\|'builder'\|'aesthetic'\|'rebuild'` \| null |
| `emailStatus` / `smsStatus` | `'pending'` \| null |
| `source` | `'screen-one'` |
| `userAgent` / `referer` | string \| null |
| `createdAt` / `updatedAt` / `completedAt` | Firestore Timestamp |

---

## Steps

### 1. Auth helper — `src/lib/adminAuth.ts`

- Export `requireBasicAuth(request: Request): Response | null` — returns a `401`
  `Response` (with `WWW-Authenticate: Basic realm="admin"`) when the
  `Authorization` header is missing or wrong, else `null`.
- Expected user = `env.ADMIN_USER ?? 'admin'`, password = `env.ADMIN_PASSWORD`,
  read via `{ ...process.env, ...import.meta.env }` (same pattern as
  `firebase.ts`).
- If `ADMIN_PASSWORD` is unset → return a `500` (never run open).
- Constant-time compare (length check + XOR accumulate, or `crypto.timingSafeEqual`).

### 2. `src/pages/admin/index.astro`

- `export const prerender = false;`
- `const denied = requireBasicAuth(Astro.request); if (denied) return denied;`
- `db.collection('survey_responses').orderBy('createdAt', 'desc').limit(500).get()`.
  Handle empty. `// TODO: paginate` past 500.
- Optional server-side filters from query params: `?status=partial|complete`,
  `?profile=<key>`. Apply after fetch (avoid composite-index requirements).
- Render:
  - **Summary:** total, counts by `status`, counts by `profile`.
  - **Filter form:** `<form method="get">` with `status` + `profile` `<select>`s.
  - **Table** (newest first): created, status, profile, world, email, phone, age,
    gender, life, inspires (join `'; '`), emailStatus, smsStatus. Timestamps via
    `.toDate().toISOString()` (or a short local format).
  - **"Export CSV"** link → `/admin/responses.csv` (carry current query string).
- `<meta name="robots" content="noindex">`. Minimal inline styling or reuse
  `src/styles/tokens.css`; this is an internal tool.

### 3. `src/pages/admin/responses.csv.ts`

- `APIRoute`, `export const prerender = false;`, same `requireBasicAuth`.
- Same query + filters. Return `text/csv` with
  `Content-Disposition: attachment; filename="survey_responses.csv"`.
- Flat columns matching the table; ISO timestamps; `inspires` joined `'; '`;
  quote/escape fields containing `,` `"` or newlines.

### 4. Wiring

- `public/robots.txt` → add `Disallow: /admin`.
- `.env.example` → add `ADMIN_USER=admin` and `ADMIN_PASSWORD=` (empty, with a
  comment — no real value in git).
- Sitemap already filters to `/` only, so `/admin` won't be listed — confirm.

---

## Test

```bash
# set ADMIN_PASSWORD in .env first
PATH="$HOME/.local/node-v20/bin:$PATH" npm run dev

curl -i localhost:4321/admin                              # 401 + WWW-Authenticate
curl -s -u admin:PASS localhost:4321/admin | head         # table HTML
curl -s -u admin:PASS "localhost:4321/admin?status=partial" | grep -c '<tr'
curl -s -u admin:PASS localhost:4321/admin/responses.csv | head
```

---

## Acceptance checklist

- [ ] `/admin` and `/admin/responses.csv` build as on-demand functions (not prerendered)
- [ ] No `Authorization` header → `401` with `WWW-Authenticate: Basic`
- [ ] Wrong credentials → `401`; correct → the page / CSV
- [ ] `ADMIN_PASSWORD` unset → `500`, never an open page
- [ ] Table lists rows newest-first with all columns; summary counts by status + profile
- [ ] `?status=` / `?profile=` filter both the table and the CSV
- [ ] CSV downloads with correct headers, escaped fields, ISO timestamps
- [ ] Empty collection renders without error
- [ ] No stack traces in any response; failures log server-side + generic 500
- [ ] `public/robots.txt` disallows `/admin`; `.env.example` documents the vars
- [ ] Firestore rules unchanged (still deny-all; Admin SDK bypasses them)
- [ ] `npm run check` clean; `npm run build` clean on Node 20

---

## After building

Tell the user to add `ADMIN_USER` / `ADMIN_PASSWORD` to Vercel → Project Settings
→ Environment Variables (all environments), then redeploy. Note in the PR that
Basic Auth here is shared-credential, no session, no audit log — fine for an MVP
internal tool over Vercel's HTTPS.

Update `BUILD_LOG.md` (move the admin row from "Open / next" to a history entry).

---

## Prompt to paste into the new chat

> Read `admin-build-brief.md` in this repo, then the files it lists. Build the
> `/admin` SSR page and `/admin/responses.csv` export over Firestore
> `survey_responses`, gated by HTTP Basic Auth against an `ADMIN_PASSWORD` env
> var. Table + per-profile/per-status counts + filters + CSV. Keep Firestore
> rules deny-all (Admin SDK only). When done, run the acceptance checklist and
> report pass/fail per item, then update `BUILD_LOG.md`.
