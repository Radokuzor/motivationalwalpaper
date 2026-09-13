/**
 * POST /api/analytics/session-end — visitor-session summary -> Telegram + Firestore.
 *
 * Fired once per browser session by the client tracker (src/scripts/analyticsTracker.ts)
 * via navigator.sendBeacon, right as the visitor leaves. The whole page chain (and,
 * since 2026-09-13, which wallpapers were on screen and for how long) arrives in one
 * payload. Two things happen with it:
 *   - Telegram notification (unchanged) — dropped for bounces.
 *   - Firestore aggregate counters (new), read by /admin/seo — recorded even for
 *     bounces, since a quick page view/entry point is still real traffic data:
 *       page_stats/<slug>        { path, views, dwellMs }
 *       referrer_stats/<bucket>  { bucket, sessions }   — traffic source
 *       entry_page_stats/<slug>  { path, sessions }     — landing page
 *       wallpaper_assets/<id>    { views, dwellMs }     — merged onto the existing doc
 *       world_stats/<world>      { views, dwellMs }     — merged onto the existing doc
 * All public/unauthenticated, so every client-supplied value is validated/capped
 * before use, same posture as /api/downloads.
 */
import type { APIRoute } from 'astro';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../../lib/firebase';
import { WORLD_KEYS } from '../../../lib/wallpaperAssets';
import { notifyTelegram, escapeMarkdown } from '../../../lib/telegram';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

interface PageVisit {
  path: string;
  enteredAt: number;
  exitedAt: number | null;
  maxScrollPct: number;
}

const SITE_NAME = 'motivationalwallpaper.com';
const BOUNCE_DURATION_MS = 3000;
const BOUNCE_MAX_SCROLL_PCT = 10;
const MAX_ACTIONS = 20;
const MAX_WALLPAPER_VIEWS = 100;
const MAX_DWELL_MS = 24 * 60 * 60 * 1000; // a day — anything past this is a bad clock, not real dwell
const ASSET_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const WORLD_SET = new Set<string>(WORLD_KEYS);

function isPageVisit(value: unknown): value is PageVisit {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.path === 'string' &&
    typeof p.enteredAt === 'number' &&
    (p.exitedAt === null || typeof p.exitedAt === 'number') &&
    typeof p.maxScrollPct === 'number'
  );
}

interface WallpaperViewIn {
  world: string;
  assetId: string | null;
  dwellMs: number;
}

function isWallpaperView(value: unknown): value is WallpaperViewIn {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  if (!WORLD_SET.has(w.world as string)) return false;
  if (w.assetId !== null && !(typeof w.assetId === 'string' && ASSET_ID_RE.test(w.assetId))) return false;
  return typeof w.dwellMs === 'number' && w.dwellMs >= 0 && w.dwellMs <= MAX_DWELL_MS;
}

/** Firestore doc-id-safe slug for a path — dedupes on shape, not on exact bytes. */
function pathSlug(path: string): string {
  const cleaned = path.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\//g, '_').slice(0, 200);
  return cleaned || 'root';
}

/** Traffic-source bucket for a referrer URL — hostname, or 'direct' if none/unparseable. */
function referrerBucket(referrer: string | null): string {
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host.slice(0, 200) || 'direct';
  } catch {
    return 'direct';
  }
}

/** Sum count + dwellMs per key, so a batch never writes the same doc twice
 *  (Firestore rejects that) even if a session revisited the same page/wallpaper. */
function groupBy<T>(items: T[], keyFn: (t: T) => string, dwellFn: (t: T) => number) {
  const map = new Map<string, { count: number; dwellMs: number }>();
  for (const item of items) {
    const key = keyFn(item);
    const entry = map.get(key) ?? { count: 0, dwellMs: 0 };
    entry.count += 1;
    entry.dwellMs += dwellFn(item);
    map.set(key, entry);
  }
  return map;
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ ok: false }, 400);
  }

  const pages = Array.isArray(body.pages) ? body.pages.filter(isPageVisit) : [];
  const startedAt = typeof body.startedAt === 'number' ? body.startedAt : null;
  const endedAt = typeof body.endedAt === 'number' ? body.endedAt : null;
  const referrer = typeof body.referrer === 'string' && body.referrer ? body.referrer : null;
  const purchased = body.purchased === true;
  const actions = Array.isArray(body.actions)
    ? body.actions.filter((a): a is string => typeof a === 'string' && a.length > 0).slice(0, MAX_ACTIONS)
    : [];
  const wallpaperViews = Array.isArray(body.wallpaperViews)
    ? body.wallpaperViews.filter(isWallpaperView).slice(0, MAX_WALLPAPER_VIEWS)
    : [];

  if (pages.length === 0) return json({ ok: true });
  if (startedAt === null || endedAt === null) return json({ ok: true });

  const durationMs = Math.max(0, endedAt - startedAt);
  const maxScrollPct = Math.max(0, ...pages.map((p) => p.maxScrollPct));
  const reachedCheckout = pages.some((page) => page.path === '/checkout');
  const abandonedCheckout = reachedCheckout && purchased !== true;

  // Aggregate counters for /admin/seo — recorded even for a bounce (a quick
  // page view / entry point is still real traffic worth counting), unlike
  // the Telegram notification below which skips bounces to avoid noise.
  try {
    const batch = db.batch();
    const pathBySlug = new Map(pages.map((p) => [pathSlug(p.path), p.path]));
    const byPath = groupBy(pages, (p) => pathSlug(p.path), (p) =>
      Math.max(0, (p.exitedAt ?? endedAt) - p.enteredAt),
    );
    for (const [slug, stat] of byPath) {
      batch.set(
        db.collection('page_stats').doc(slug),
        {
          path: pathBySlug.get(slug),
          views: FieldValue.increment(stat.count),
          dwellMs: FieldValue.increment(stat.dwellMs),
        },
        { merge: true },
      );
    }

    batch.set(
      db.collection('referrer_stats').doc(referrerBucket(referrer)),
      { sessions: FieldValue.increment(1) },
      { merge: true },
    );
    batch.set(
      db.collection('entry_page_stats').doc(pathSlug(pages[0].path)),
      { path: pages[0].path, sessions: FieldValue.increment(1) },
      { merge: true },
    );

    const byAsset = groupBy(
      wallpaperViews.filter((w) => w.assetId),
      (w) => w.assetId as string,
      (w) => w.dwellMs,
    );
    for (const [assetId, stat] of byAsset) {
      batch.set(
        db.collection('wallpaper_assets').doc(assetId),
        { views: FieldValue.increment(stat.count), dwellMs: FieldValue.increment(stat.dwellMs) },
        { merge: true },
      );
    }
    const byWorld = groupBy(wallpaperViews, (w) => w.world, (w) => w.dwellMs);
    for (const [world, stat] of byWorld) {
      batch.set(
        db.collection('world_stats').doc(world),
        { world, views: FieldValue.increment(stat.count), dwellMs: FieldValue.increment(stat.dwellMs) },
        { merge: true },
      );
    }

    await batch.commit();
  } catch (err) {
    console.error('session-end analytics aggregation failed', err);
  }

  // Ignore very short bounces (Telegram notification only — stats above already recorded).
  const isBounce =
    durationMs < BOUNCE_DURATION_MS || pages.length <= 1 || maxScrollPct < BOUNCE_MAX_SCROLL_PCT;
  if (isBounce) return json({ ok: true });

  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  const pathChain = pages.map((page) => escapeMarkdown(page.path)).join(' → ');

  const lines = [
    `🌐 *${SITE_NAME}*`,
    abandonedCheckout ? '⚠️ *Checkout abandoned*' : '👀 *Visitor session*',
    `Duration: ${durationText}`,
    `Pages (${pages.length}): ${pathChain}`,
    `Max scroll: ${maxScrollPct}%`,
  ];
  if (actions.length > 0) {
    lines.push(`Actions: ${actions.map(escapeMarkdown).join(', ')}`);
  }
  if (referrer) {
    lines.push(`Referrer: ${escapeMarkdown(referrer)}`);
  }

  await notifyTelegram(lines.join('\n'));

  return json({ ok: true });
};
