/**
 * Firebase Admin SDK — server-side only.
 *
 * Every write to Firestore goes through this. The client never touches the
 * database (Firestore rules deny all client access). Credentials come from three
 * env vars — `.env` for local dev (gitignored), Vercel env vars in production:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   (literal "\n" sequences are unescaped below)
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Vercel exposes env vars on `process.env` at runtime; `astro dev` loads `.env`
// into `import.meta.env`. Read whichever is populated.
const env = { ...process.env, ...import.meta.env } as Record<string, string | undefined>;

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });

export const db = getFirestore(app);
