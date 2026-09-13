/**
 * POST /api/downloads — download counters.
 *
 * Fired fire-and-forget by CaptureSheet.astro the moment a real download
 * starts (see `downloadOriginal` call site). Bumps three things so the
 * admin page can read totals without scanning events:
 *   - `wallpaper_assets/<assetId>.downloads` (+1) — per-wallpaper count
 *   - `world_stats/<world>.downloads` (+1) — per-category count
 *   - one `download_events` row — timestamped log for trend queries later
 * Plus, when `responseId` is present (CaptureSheet.astro mints it before
 * this call and reuses it for the survey row Quiz.astro upserts right
 * after), appends `{assetId, world, at}` to
 * `survey_responses/<responseId>.downloadedAssets` — lets /admin show which
 * wallpaper(s) each survey respondent actually downloaded. Both docs are
 * `merge`d so it doesn't matter which of /api/downloads or /api/survey's
 * first upsert lands first.
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
const RESPONSE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
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

  const responseId = typeof body.responseId === 'string' ? body.responseId : '';
  if (responseId && !RESPONSE_ID_RE.test(responseId)) {
    return json({ ok: false, error: 'invalid responseId' }, 400);
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
      responseId: responseId || null,
      userAgent: request.headers.get('user-agent') ?? null,
      referer: request.headers.get('referer') ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (responseId) {
      const responseRef = db.collection('survey_responses').doc(responseId);
      // This call typically lands before /api/survey's own upsert creates the
      // row (CaptureSheet.astro fires the download, *then* emits the event
      // Quiz.astro upserts on) — so `merge: true` alone would silently create
      // a doc with no `createdAt`, which /admin's `orderBy('createdAt')` would
      // then never return. Stamp it here too, exactly like /api/survey does,
      // whenever this call is the one bringing the doc into existence.
      const existing = await responseRef.get();
      batch.set(
        responseRef,
        {
          downloadedAssets: FieldValue.arrayUnion({ assetId: assetId || null, world, at: Date.now() }),
          ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), source: 'screen-one' }),
        },
        { merge: true },
      );
    }
    await batch.commit();
  } catch (err) {
    console.error('download counters write failed', err);
    return json({ ok: false, error: 'write failed' }, 500);
  }

  return json({ ok: true }, 200);
};
