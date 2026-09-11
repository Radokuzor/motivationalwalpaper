/**
 * POST /api/wallpapers — upload one (or a few) wallpaper images from /submit.
 *
 * `multipart/form-data`:
 *   file       one or more image files (jpeg/png/webp/avif)
 *   world      zero or more world keys this photo belongs to (repeat the
 *              field per category; omit / 'unsorted' to leave it unsorted)
 *   preferred  '1' to mark this upload as the hero photo for each of its
 *              worlds (replaces the CSS gradient there)
 *   website    honeypot — if filled, we 200 and write nothing
 *
 * Per file: decode + validate with sharp, derive a content hash id, build a
 * thumbnail + dHash, push the original and thumb to Cloud Storage, upsert the
 * `wallpaper_assets/<id>` doc. Re-uploading identical bytes updates in place.
 *
 * A fetch caller (Accept: application/json) gets a JSON result array; a plain
 * browser form submit gets a 303 back to /submit.
 *
 * Note: this route is deliberately ungated. It carries `noindex` + a honeypot;
 * the client uploads one file per request and downscales anything large so each
 * body stays under Vercel's ~4.5 MB serverless limit.
 *
 * GET /api/wallpapers — public read side, consumed client-side by Screen One
 * so an upload shows up on the live site without a rebuild:
 *   ?world=<key>   sorted assets tagged with that world (preferred first)
 *   ?hero=1        one hero photo per world — the reel/theme grid/category
 *                  grid/PNG export use this to replace a world's CSS gradient
 */
import type { APIRoute } from 'astro';
import { db } from '../../../lib/firebase';
import { WORLDS, type WorldKey } from '../../../data/worlds';
import {
  ASSET_COLLECTION,
  processImage,
  putAssetFiles,
  upsertAssetDoc,
  signedUrl,
  thumbPath,
  normalizeWorlds,
  ImageRejected,
} from '../../../lib/wallpaperAssets';

export const prerender = false;

const MAX_BYTES = 12 * 1024 * 1024; // defensive; Vercel 413s earlier in prod

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

interface UploadResult {
  filename: string;
  ok: boolean;
  id?: string;
  worlds?: string[];
  preferred?: boolean;
  status?: string;
  thumbUrl?: string;
  error?: string;
}

export const POST: APIRoute = async ({ request }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'expected multipart/form-data' }, 400);
  }

  // Honeypot — a real operator never fills this.
  if (form.get('website')) return json({ ok: true, results: [] }, 200);

  const worlds = normalizeWorlds(form.getAll('world'));
  if (worlds === undefined) return json({ ok: false, error: 'invalid world' }, 400);
  const preferred = form.get('preferred') === '1';

  const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return json({ ok: false, error: 'no file' }, 400);

  const results: UploadResult[] = [];
  for (const file of files) {
    const filename = file.name || 'upload';
    try {
      if (file.size > MAX_BYTES) throw new ImageRejected('file too large (max 12 MB)');
      const buf = Buffer.from(await file.arrayBuffer());
      const img = await processImage(buf);
      await putAssetFiles(img, buf);
      const doc = await upsertAssetDoc(img, worlds, filename, preferred);
      results.push({
        filename,
        ok: true,
        id: doc.id,
        worlds: doc.worlds,
        preferred: doc.preferred,
        status: doc.status,
        thumbUrl: await signedUrl(thumbPath(doc.id)),
      });
    } catch (err) {
      const msg = err instanceof ImageRejected ? err.message : 'processing failed';
      if (!(err instanceof ImageRejected)) console.error('wallpaper upload failed', filename, err);
      results.push({ filename, ok: false, error: msg });
    }
  }

  if (wantsJson) {
    return json({ ok: results.some((r) => r.ok), results }, 200);
  }
  return new Response(null, { status: 303, headers: { Location: '/submit' } });
};

interface PublicAsset {
  id: string;
  thumbUrl: string;
  worlds: WorldKey[];
  preferred: boolean;
}

async function toPublicAsset(doc: FirebaseFirestore.DocumentSnapshot): Promise<PublicAsset> {
  const v = doc.data() ?? {};
  return {
    id: doc.id,
    thumbUrl: await signedUrl(v.storageThumb ?? thumbPath(doc.id), 30 * 60 * 1000),
    worlds: (v.worlds ?? []) as WorldKey[],
    preferred: v.preferred === true,
  };
}

export const GET: APIRoute = async ({ url }) => {
  if (url.searchParams.get('hero') === '1') {
    // One query for every preferred asset, then pick the freshest per world in
    // memory — an equality-only filter needs no composite index, and this
    // catalog is operator-managed (small), so sorting client-side is cheap.
    const snap = await db.collection(ASSET_COLLECTION).where('preferred', '==', true).limit(200).get();
    const docs = snap.docs.slice().sort((a, b) => {
      const at = a.data().updatedAt?.toMillis?.() ?? 0;
      const bt = b.data().updatedAt?.toMillis?.() ?? 0;
      return bt - at;
    });

    const hero: Partial<Record<WorldKey, { id: string; thumbUrl: string; originalUrl: string }>> = {};
    for (const doc of docs) {
      const v = doc.data();
      const worlds = (v.worlds ?? []) as WorldKey[];
      for (const key of worlds) {
        if (hero[key]) continue; // already have the freshest for this world
        hero[key] = {
          id: doc.id,
          thumbUrl: await signedUrl(v.storageThumb ?? thumbPath(doc.id), 30 * 60 * 1000),
          originalUrl: await signedUrl(v.storageOriginal, 30 * 60 * 1000),
        };
      }
      if (Object.keys(hero).length === WORLDS.length) break;
    }
    return json(hero);
  }

  const world = url.searchParams.get('world');
  if (world) {
    if (!WORLDS.some((w) => w.key === world)) return json({ error: 'unknown world' }, 400);
    const snap = await db
      .collection(ASSET_COLLECTION)
      .where('worlds', 'array-contains', world)
      .limit(60)
      .get();
    const items = await Promise.all(snap.docs.map(toPublicAsset));
    items.sort((a, b) => Number(b.preferred) - Number(a.preferred));
    return json({ items });
  }

  return json({ error: 'pass ?world=<key> or ?hero=1' }, 400);
};
