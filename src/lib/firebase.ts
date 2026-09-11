/**
 * Firebase Admin SDK — server-side only.
 *
 * Every write to Firestore and Cloud Storage goes through this. The client never
 * touches either (Firestore rules + Storage rules deny all client access).
 * Credentials come from env vars — `.env` for local dev (gitignored), Vercel env
 * vars in production:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY      (literal "\n" sequences are unescaped below)
 *   FIREBASE_STORAGE_BUCKET   (e.g. motivewallpaper-220e4.firebasestorage.app —
 *                              only needed by routes that touch Storage)
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

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
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });

export const db = getFirestore(app);

/** Default Cloud Storage bucket. Throws on use if FIREBASE_STORAGE_BUCKET is unset. */
export const bucket = getStorage(app).bucket();
