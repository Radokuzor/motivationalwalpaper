/**
 * POST /api/downloads — download counters.
 *
 * Fired fire-and-forget by CaptureSheet.astro the moment a real download
 * starts (see `downloadOriginal` call site). Bumps three things so the
 * admin page can read totals without scanning events:
 *   - `wallpaper_assets/<assetId>.downloads` (+1) — per-wallpaper count
 *   - `world_stats/<world>.downloads` (+1) — per-category count
 *   - one `download_events` row — timestamped log for trend queries later
 *
 * Best-effort like /api/survey's Telegram leg: a bad/missing asset just
 * skips the per-wallpaper increment (the asset may have been deleted from
 * /submit since), never fails the whole request.
 */
import type { APIRoute } from 'astro';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../lib/firebase';
import { WORLD_KEYS } from '../../lib/wallpaperAssets';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const ASSET_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const WORLD_SET = new Set<string>(WORLD_KEYS);

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400);
  }

  const world = typeof body.world === 'string' ? body.world : '';
  if (!WORLD_SET.has(world)) return json({ ok: false, error: 'invalid world' }, 400);

  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  if (assetId && !ASSET_ID_RE.test(assetId)) {
    return json({ ok: false, error: 'invalid assetId' }, 400);
  }

  try {
    const batch = db.batch();
    if (assetId) {
      batch.set(
        db.collection('wallpaper_assets').doc(assetId),
        { downloads: FieldValue.increment(1), lastDownloadedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    batch.set(
      db.collection('world_stats').doc(world),
      { world, downloads: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    batch.create(db.collection('download_events').doc(), {
      assetId: assetId || null,
      world,
      userAgent: request.headers.get('user-agent') ?? null,
      referer: request.headers.get('referer') ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    console.error('download counters write failed', err);
    return json({ ok: false, error: 'write failed' }, 500);
  }

  return json({ ok: true }, 200);
};
