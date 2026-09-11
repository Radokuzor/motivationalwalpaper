/**
 * Wallpaper asset helpers — shared by /submit and the /api/wallpapers routes.
 *
 * An asset is one image the operator uploaded on /submit, filed under any
 * number of worlds/categories (or left unsorted), and optionally marked
 * `preferred` — the photo chosen as that category's actual hero wallpaper.
 * The original + a webp thumbnail live in Cloud
 * Storage under `wallpaper_assets/<id>/`; the metadata is one Firestore doc in
 * `wallpaper_assets`, keyed `submit_<sha1-16>` so re-uploading the same bytes
 * updates in place instead of duplicating.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { FieldValue } from 'firebase-admin/firestore';
import { db, bucket } from './firebase';
import { WORLDS, type WorldKey } from '../data/worlds';

export const ASSET_COLLECTION = 'wallpaper_assets';

/** Smallest allowed short edge — reject anything below phone-ish resolution. */
const MIN_EDGE = 500;
const THUMB_WIDTH = 640;

export const WORLD_KEYS = WORLDS.map((w) => w.key);
const WORLD_KEY_SET = new Set<string>(WORLD_KEYS);

/**
 * Normalize a `world` field (string, repeated form field, or JSON array) into
 * a de-duped `WorldKey[]` — a wallpaper can belong to more than one category.
 * Empty / `'unsorted'` entries are dropped (an empty array means unsorted).
 * `undefined` means at least one entry wasn't a real world key.
 */
export function normalizeWorlds(value: unknown): WorldKey[] | undefined {
  const arr = Array.isArray(value) ? value : value == null ? [] : [value];
  const out: WorldKey[] = [];
  for (const v of arr) {
    if (v === '' || v === 'unsorted' || v == null) continue;
    if (!WORLD_KEY_SET.has(v as string)) return undefined;
    const key = v as WorldKey;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

const FORMATS: Record<string, { ext: string; mime: string }> = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
  avif: { ext: 'avif', mime: 'image/avif' },
};

export interface ProcessedImage {
  sha: string;
  id: string;
  format: string;
  ext: string;
  mime: string;
  width: number;
  height: number;
  aspect: number;
  bytes: number;
  phash: string;
  thumb: Buffer;
}

export class ImageRejected extends Error {}

/** Decode + validate an upload, derive its id, dHash and a thumbnail. */
export async function processImage(buf: Buffer): Promise<ProcessedImage> {
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new ImageRejected('not a readable image');
  }
  const fmt = meta.format ?? '';
  const spec = FORMATS[fmt];
  if (!spec) throw new ImageRejected(`unsupported format: ${fmt || 'unknown'}`);
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (Math.min(width, height) < MIN_EDGE) {
    throw new ImageRejected(`too small (${width}×${height}, min short edge ${MIN_EDGE}px)`);
  }

  const sha = createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const phash = await dHash(buf);
  const thumb = await sharp(buf)
    .rotate() // honour EXIF orientation
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  return {
    sha,
    id: `submit_${sha}`,
    format: fmt,
    ext: spec.ext,
    mime: spec.mime,
    width,
    height,
    aspect: +(width / height).toFixed(4),
    bytes: buf.length,
    phash,
    thumb,
  };
}

/** 64-bit difference hash as 16 hex chars — cheap near-duplicate key. */
async function dHash(buf: Buffer): Promise<string> {
  const raw = await sharp(buf).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      bits += raw[row * 9 + col] > raw[row * 9 + col + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

const assetDir = (id: string) => `${ASSET_COLLECTION}/${id}`;
export const originalPath = (id: string, ext: string) => `${assetDir(id)}/original.${ext}`;
export const thumbPath = (id: string) => `${assetDir(id)}/thumb.webp`;

/** Put the original + thumbnail bytes in Storage. */
export async function putAssetFiles(img: ProcessedImage, original: Buffer): Promise<void> {
  await Promise.all([
    bucket.file(originalPath(img.id, img.ext)).save(original, {
      contentType: img.mime,
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    }),
    bucket.file(thumbPath(img.id)).save(img.thumb, {
      contentType: 'image/webp',
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    }),
  ]);
}

/** Delete every Storage object under an asset's folder. Best-effort. */
export async function deleteAssetFiles(id: string): Promise<void> {
  await bucket.deleteFiles({ prefix: `${assetDir(id)}/`, force: true });
}

/** Short-lived v4 read URL for a Storage object (the bucket denies public reads). */
export async function signedUrl(path: string, ttlMs = 60 * 60 * 1000): Promise<string> {
  const [url] = await bucket.file(path).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + ttlMs,
  });
  return url;
}

export interface AssetDoc {
  id: string;
  status: 'sorted' | 'unsorted';
  worlds: WorldKey[];
  /** Chosen as the hero photo for each of its `worlds` — replaces the CSS
   *  gradient in the reel/theme grid/category grid/PNG export for those
   *  categories. When more than one asset is preferred for the same world,
   *  the most recently updated one wins. */
  preferred: boolean;
  source: 'submit';
  sha: string;
  originalFilename: string | null;
  license: 'owner-supplied';
  width: number;
  height: number;
  aspect: number;
  bytes: number;
  format: string;
  phash: string;
  storageOriginal: string;
  storageThumb: string;
}

/** Upsert the Firestore doc for a freshly processed upload. */
export async function upsertAssetDoc(
  img: ProcessedImage,
  worlds: WorldKey[],
  originalFilename: string | null,
  preferred = false,
): Promise<AssetDoc> {
  const ref = db.collection(ASSET_COLLECTION).doc(img.id);
  const existing = await ref.get();
  const doc: Omit<AssetDoc, 'id'> = {
    status: worlds.length ? 'sorted' : 'unsorted',
    worlds,
    preferred,
    source: 'submit',
    sha: img.sha,
    originalFilename,
    license: 'owner-supplied',
    width: img.width,
    height: img.height,
    aspect: img.aspect,
    bytes: img.bytes,
    format: img.format,
    phash: img.phash,
    storageOriginal: originalPath(img.id, img.ext),
    storageThumb: thumbPath(img.id),
  };
  await ref.set(
    {
      ...doc,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  return { id: img.id, ...doc };
}
