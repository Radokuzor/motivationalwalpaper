/**
 * PATCH  /api/wallpapers/:id   — re-file an asset. JSON body: any of
 *   { worlds: string[], preferred: boolean }  (at least one required).
 * DELETE /api/wallpapers/:id   — remove the Firestore doc and its Storage files.
 *
 * Called by the /submit grid (category checkboxes, preferred toggle, delete
 * button). Ungated, same posture as POST /api/wallpapers.
 */
import type { APIRoute } from 'astro';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../../lib/firebase';
import {
  ASSET_COLLECTION,
  deleteAssetFiles,
  normalizeWorlds,
} from '../../../lib/wallpaperAssets';

export const prerender = false;

const ID_RE = /^submit_[a-f0-9]{16}$/;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id ?? '';
  if (!ID_RE.test(id)) return json({ ok: false, error: 'bad id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400);
  }

  if (body.worlds === undefined && body.preferred === undefined) {
    return json({ ok: false, error: 'nothing to update' }, 400);
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (body.worlds !== undefined) {
    const worlds = normalizeWorlds(body.worlds);
    if (worlds === undefined) return json({ ok: false, error: 'invalid world' }, 400);
    update.worlds = worlds;
    update.status = worlds.length ? 'sorted' : 'unsorted';
  }

  if (body.preferred !== undefined) {
    if (typeof body.preferred !== 'boolean') {
      return json({ ok: false, error: 'preferred must be a boolean' }, 400);
    }
    update.preferred = body.preferred;
  }

  const ref = db.collection(ASSET_COLLECTION).doc(id);
  if (!(await ref.get()).exists) return json({ ok: false, error: 'not found' }, 404);

  await ref.set(update, { merge: true });
  const { updatedAt: _updatedAt, ...rest } = update;
  return json({ ok: true, id, ...rest });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id ?? '';
  if (!ID_RE.test(id)) return json({ ok: false, error: 'bad id' }, 400);

  try {
    await deleteAssetFiles(id);
    await db.collection(ASSET_COLLECTION).doc(id).delete();
  } catch (err) {
    console.error('wallpaper delete failed', id, err);
    return json({ ok: false, error: 'delete failed' }, 500);
  }
  return json({ ok: true, id });
};
