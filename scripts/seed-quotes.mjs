/**
 * Seed Firestore `figure_quotes` from src/data/quotes.json.
 *
 *   PATH="$HOME/.local/node-v20/bin:$PATH" npm run seed:quotes
 *   # or: node scripts/seed-quotes.mjs
 *
 * Reads FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY from
 * .env (same three vars as src/lib/firebase.ts) or the shell environment.
 * Idempotent: upserts one doc per figure, keyed by slug (`david-goggins`).
 * Run it again whenever quotes.json changes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader — avoids a dotenv dependency for a one-off script. */
function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let [, key, val] = m;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(resolve(root, '.env'));

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
  process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error(
    'Missing FIREBASE_* env vars. Add them to .env or export them before running.',
  );
  process.exit(1);
}

/** Kept in sync with `quoteSlug` in src/data/quotes.ts. */
const slug = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
const db = getFirestore(app);

const sets = JSON.parse(
  readFileSync(resolve(root, 'src/data/quotes.json'), 'utf8'),
);

const batch = db.batch();
let figures = 0;
let quotes = 0;
for (const set of sets) {
  if (!set?.figure || !Array.isArray(set.quotes) || set.quotes.length < 2) {
    console.error(`Skipping malformed entry: ${JSON.stringify(set)}`);
    continue;
  }
  batch.set(
    db.collection('figure_quotes').doc(slug(set.figure)),
    {
      figure: set.figure,
      quotes: set.quotes,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  figures += 1;
  quotes += set.quotes.length;
}

await batch.commit();
console.log(`Seeded ${figures} figures / ${quotes} quotes into figure_quotes.`);
process.exit(0);
