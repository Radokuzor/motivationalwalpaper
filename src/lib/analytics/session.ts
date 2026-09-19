/**
 * Analytics storage — validation in, Firestore out.
 *
 * Two collections carry the new system:
 *   analytics_sessions/<sessionId>  one document per visit, fully enriched
 *                                   (geo, device, acquisition, behaviour, bot
 *                                   verdict). This is what /admin filters on.
 *   analytics_daily/<YYYY-MM-DD>    counter-only rollups that never expire, so
 *                                   long-range trends survive session TTL.
 *
 * The pre-existing aggregate collections (page_stats, entry_page_stats,
 * referrer_stats, world_stats, wallpaper_assets) keep being written so nothing
 * that already reads them breaks — with bot traffic split into its own fields
 * instead of silently inflating the human numbers.
 *
 * Writes happen at two moments, and that redundancy is deliberate: a hit lands
 * on every page load (so a page view is counted even when the browser kills the
 * unload beacon, which mobile Safari does often), and session-end lands once on
 * the way out with the behavioural detail. Anything counted at hit time is
 * never re-counted at session end.
 *
 * Every field here arrives from a public, unauthenticated endpoint, so all of
 * it is validated and capped before it touches the database.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../firebase';
import { WORLD_KEYS } from '../wallpaperAssets';
import { parseUserAgent } from './ua';
import { classifyTraffic, type TrafficQuality } from './bots';
import { classifyAcquisition, safeKey, type Acquisition, type UtmParams } from './sources';
import { readGeo, visitorHash, dayKey, fingerprint } from './request';
import { ANALYTICS_LIMITS } from './payload';
import type {
  ClientEnvironment,
  ClientAcquisition,
  EngagementPayload,
  HitPayload,
  PageVisitPayload,
  SessionEndPayload,
  WallpaperViewPayload,
} from './payload';

export const SESSIONS_COLLECTION = 'analytics_sessions';
export const DAILY_COLLECTION = 'analytics_daily';

/** How long raw session documents are kept. Rollups are forever. */
const SESSION_RETENTION_DAYS = 120;

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ASSET_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const WORLD_SET = new Set<string>(WORLD_KEYS);

// ---------------------------------------------------------------- validation

const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

const int = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, Math.round(v)));
};

const numOrNull = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
};

/** Path, normalised for grouping: query and hash dropped, trailing slash trimmed. */
export function cleanPath(value: unknown): string | null {
  const raw = str(value, 300);
  if (!raw || !raw.startsWith('/')) return null;
  const path = raw.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return path || '/';
}

/** Firestore doc-id-safe slug for a path. */
export function pathSlug(path: string): string {
  const cleaned = path.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\//g, '_').slice(0, 200);
  return cleaned || 'root';
}

/**
 * Doc id for `referrer_stats`. Dots stay — a document id may contain them, and
 * "google.com" is the id this collection has always used, so rewriting it would
 * fork every existing counter. (Map *keys* inside the rollups are a different
 * matter: there a dot is a field-path separator, which is what `safeKey` is for.)
 */
function hostDocId(host: string | null): string {
  if (!host) return 'direct';
  const cleaned = host.replace(/[/\\\[\]*~]/g, '-').slice(0, 200);
  return cleaned === '.' || cleaned === '..' || !cleaned ? 'direct' : cleaned;
}

export function parseEnvironment(value: unknown): ClientEnvironment {
  const e = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    screenW: int(e.screenW, 0, 30000) ?? 0,
    screenH: int(e.screenH, 0, 30000) ?? 0,
    viewportW: int(e.viewportW, 0, 30000) ?? 0,
    viewportH: int(e.viewportH, 0, 30000) ?? 0,
    dpr: numOrNull(e.dpr, 0, 10) ?? 1,
    orientation: e.orientation === 'portrait' || e.orientation === 'landscape' ? e.orientation : null,
    touch: e.touch === true,
    maxTouchPoints: int(e.maxTouchPoints, 0, 64) ?? 0,
    language: str(e.language, 20),
    languageCount: int(e.languageCount, 0, 50) ?? 0,
    timezone: str(e.timezone, 64),
    cores: int(e.cores, 0, 512),
    memoryGb: numOrNull(e.memoryGb, 0, 1024),
    connection: str(e.connection, 20),
    saveData: bool(e.saveData),
    colorScheme: e.colorScheme === 'dark' || e.colorScheme === 'light' ? e.colorScheme : null,
    reducedMotion: bool(e.reducedMotion),
    uaPlatform: str(e.uaPlatform, 40),
    uaMobile: bool(e.uaMobile),
    uaBrands: str(e.uaBrands, 200),
    webdriver: e.webdriver === true,
    cookieEnabled: e.cookieEnabled !== false,
    pluginCount: int(e.pluginCount, 0, 500) ?? 0,
    ttfbMs: int(e.ttfbMs, 0, 120000),
    loadMs: int(e.loadMs, 0, 600000),
  };
}

const CLICK_ID_KEYS = ['gclid', 'msclkid', 'fbclid', 'ttclid', 'twclid', 'li_fat_id'] as const;

export function parseAcquisition(value: unknown): ClientAcquisition {
  const a = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawIds = (a.clickIds && typeof a.clickIds === 'object' ? a.clickIds : {}) as Record<string, unknown>;
  const clickIds: Record<string, string> = {};
  for (const key of CLICK_ID_KEYS) {
    const v = str(rawIds[key], 200);
    if (v) clickIds[key] = v;
  }
  return {
    utmSource: str(a.utmSource, 100),
    utmMedium: str(a.utmMedium, 100),
    utmCampaign: str(a.utmCampaign, 120),
    utmTerm: str(a.utmTerm, 120),
    utmContent: str(a.utmContent, 120),
    clickIds,
    refTag: str(a.refTag, 100),
  };
}

function parsePages(value: unknown): PageVisitPayload[] {
  if (!Array.isArray(value)) return [];
  const out: PageVisitPayload[] = [];
  for (const raw of value.slice(0, ANALYTICS_LIMITS.MAX_PAGES)) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Record<string, unknown>;
    const path = cleanPath(p.path);
    const enteredAt = int(p.enteredAt, 0, Number.MAX_SAFE_INTEGER);
    if (!path || enteredAt === null) continue;
    out.push({
      path,
      title: str(p.title, 120),
      enteredAt,
      exitedAt: int(p.exitedAt, 0, Number.MAX_SAFE_INTEGER),
      maxScrollPct: int(p.maxScrollPct, 0, 100) ?? 0,
      activeMs: int(p.activeMs, 0, ANALYTICS_LIMITS.MAX_DWELL_MS) ?? 0,
    });
  }
  return out;
}

function parseEngagement(value: unknown): EngagementPayload {
  const e = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const outbound = Array.isArray(e.outbound)
    ? e.outbound
        .map((h) => str(h, 120))
        .filter((h): h is string => h !== null)
        .slice(0, ANALYTICS_LIMITS.MAX_OUTBOUND)
    : [];
  return {
    clicks: int(e.clicks, 0, 100000) ?? 0,
    keypresses: int(e.keypresses, 0, 100000) ?? 0,
    pointerMoves: int(e.pointerMoves, 0, 1000000) ?? 0,
    scrollEvents: int(e.scrollEvents, 0, 1000000) ?? 0,
    activeMs: int(e.activeMs, 0, ANALYTICS_LIMITS.MAX_DWELL_MS) ?? 0,
    outbound,
  };
}

function parseWallpaperViews(value: unknown): WallpaperViewPayload[] {
  if (!Array.isArray(value)) return [];
  const out: WallpaperViewPayload[] = [];
  for (const raw of value.slice(0, ANALYTICS_LIMITS.MAX_WALLPAPER_VIEWS)) {
    if (!raw || typeof raw !== 'object') continue;
    const w = raw as Record<string, unknown>;
    if (!WORLD_SET.has(w.world as string)) continue;
    const assetId = typeof w.assetId === 'string' && ASSET_ID_RE.test(w.assetId) ? w.assetId : null;
    const dwellMs = int(w.dwellMs, 0, ANALYTICS_LIMITS.MAX_DWELL_MS);
    if (dwellMs === null) continue;
    out.push({ world: w.world as string, assetId, dwellMs });
  }
  return out;
}

export function parseHit(body: unknown): HitPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const sessionId = str(b.sessionId, 64);
  if (!sessionId || !ID_RE.test(sessionId)) return null;
  const path = cleanPath(b.path);
  if (!path) return null;
  const visitorId = str(b.visitorId, 64);
  return {
    sessionId,
    visitorId: visitorId && ID_RE.test(visitorId) ? visitorId : 'unknown',
    isFirstHit: b.isFirstHit === true,
    isNewVisitor: b.isNewVisitor === true,
    visitCount: int(b.visitCount, 1, 100000) ?? 1,
    startedAt: int(b.startedAt, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
    path,
    title: str(b.title, 120),
    referrer: str(b.referrer, 500),
    pageIndex: int(b.pageIndex, 1, ANALYTICS_LIMITS.MAX_PAGES) ?? 1,
    env: parseEnvironment(b.env),
    acquisition: parseAcquisition(b.acquisition),
  };
}

export function parseSessionEnd(body: unknown): SessionEndPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const sessionId = str(b.sessionId, 64);
  if (!sessionId || !ID_RE.test(sessionId)) return null;
  const pages = parsePages(b.pages);
  if (pages.length === 0) return null;
  const startedAt = int(b.startedAt, 0, Number.MAX_SAFE_INTEGER);
  const endedAt = int(b.endedAt, 0, Number.MAX_SAFE_INTEGER);
  if (startedAt === null || endedAt === null) return null;
  const visitorId = str(b.visitorId, 64);
  return {
    sessionId,
    visitorId: visitorId && ID_RE.test(visitorId) ? visitorId : 'unknown',
    startedAt,
    endedAt,
    referrer: str(b.referrer, 500),
    purchased: b.purchased === true,
    actions: Array.isArray(b.actions)
      ? b.actions
          .map((a) => str(a, 60))
          .filter((a): a is string => a !== null)
          .slice(0, ANALYTICS_LIMITS.MAX_ACTIONS)
      : [],
    pages,
    engagement: parseEngagement(b.engagement),
    wallpaperViews: parseWallpaperViews(b.wallpaperViews),
    env: parseEnvironment(b.env),
    acquisition: parseAcquisition(b.acquisition),
  };
}

// ------------------------------------------------------------------- helpers

const utmOf = (a: ClientAcquisition): UtmParams => ({
  source: a.utmSource,
  medium: a.utmMedium,
  campaign: a.utmCampaign,
  term: a.utmTerm,
  content: a.utmContent,
});

/** Screen-size bucket — raw pixel pairs are too long a tail to be readable. */
export function screenBucket(width: number): string {
  if (width <= 0) return 'unknown';
  if (width < 380) return '<380 (small phone)';
  if (width < 430) return '380–429 (phone)';
  if (width < 600) return '430–599 (large phone)';
  if (width < 900) return '600–899 (tablet)';
  if (width < 1280) return '900–1279 (laptop)';
  if (width < 1920) return '1280–1919 (desktop)';
  return '1920+ (large desktop)';
}

/** Visitor-local hour of day, from their own timezone when we have one. */
function localHour(at: number, timezone: string | null): number {
  if (!timezone) return new Date(at).getUTCHours();
  try {
    const formatted = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(
      new Date(at),
    );
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour % 24 : new Date(at).getUTCHours();
  } catch {
    return new Date(at).getUTCHours();
  }
}

/** Sum count + dwell per key so one batch never writes the same doc twice. */
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

const inc = (n: number) => FieldValue.increment(n);

/** Nested counter map, e.g. dims.country.US += 1 — merged, never overwritten. */
function dimension(map: Record<string, unknown>, group: string, key: string, by = 1): void {
  const bucket = (map[group] ??= {}) as Record<string, unknown>;
  bucket[safeKey(key)] = inc(by);
}

// -------------------------------------------------------------- server facts

export interface ServerContext {
  day: string;
  receivedAt: number;
  userAgent: string | null;
  acceptLanguage: string | null;
  visitorHash: string;
  fingerprint: string | null;
  geo: ReturnType<typeof readGeo>;
  device: ReturnType<typeof parseUserAgent>;
}

export function serverContext(request: Request, at = Date.now()): ServerContext {
  const day = dayKey(at);
  const userAgent = request.headers.get('user-agent');
  return {
    day,
    receivedAt: at,
    userAgent,
    acceptLanguage: request.headers.get('accept-language'),
    visitorHash: visitorHash(request, day),
    fingerprint: fingerprint(request),
    geo: readGeo(request),
    device: parseUserAgent(userAgent),
  };
}

// --------------------------------------------------------------- hit writing

/**
 * One page load. Creates the session document on the first hit and counts the
 * page view immediately, so traffic is recorded even if the exit beacon dies.
 */
export async function recordHit(hit: HitPayload, ctx: ServerContext): Promise<void> {
  const acquisition = classifyAcquisition(hit.referrer, utmOf(hit.acquisition), hit.acquisition.clickIds);
  const verdict = classifyTraffic({
    userAgent: ctx.userAgent,
    env: hit.env,
    acceptLanguage: ctx.acceptLanguage,
  });
  const isBot = verdict.quality === 'bot';
  const batch = db.batch();
  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(hit.sessionId);

  const live = {
    lastSeenAt: ctx.receivedAt,
    lastPath: hit.path,
    hitPageviews: inc(1),
    hitPaths: FieldValue.arrayUnion({ i: hit.pageIndex, path: hit.path, at: ctx.receivedAt }),
  };

  if (hit.isFirstHit) {
    batch.set(sessionRef, { ...live, ...sessionFacts(hit, ctx, acquisition, verdict) }, { merge: true });
  } else {
    batch.set(sessionRef, live, { merge: true });
  }

  // Page counters — bots kept in their own field so human numbers stay honest.
  batch.set(
    db.collection('page_stats').doc(pathSlug(hit.path)),
    isBot
      ? { path: hit.path, botViews: inc(1) }
      : { path: hit.path, views: inc(1), title: hit.title ?? null },
    { merge: true },
  );

  if (hit.isFirstHit && !isBot) {
    batch.set(
      db.collection('entry_page_stats').doc(pathSlug(hit.path)),
      { path: hit.path, sessions: inc(1) },
      { merge: true },
    );
    batch.set(
      db.collection('referrer_stats').doc(hostDocId(acquisition.referrerHost)),
      { sessions: inc(1), channel: acquisition.channel, source: acquisition.source },
      { merge: true },
    );
  }

  batch.set(db.collection(DAILY_COLLECTION).doc(ctx.day), dailyHitCounters(hit, ctx, acquisition, verdict), {
    merge: true,
  });

  await batch.commit();
}

function sessionFacts(
  hit: HitPayload,
  ctx: ServerContext,
  acquisition: Acquisition,
  verdict: ReturnType<typeof classifyTraffic>,
) {
  const env = hit.env;
  return {
    sessionId: hit.sessionId,
    day: ctx.day,
    // Server clock — the client's can be anything, and this is what /admin sorts on.
    serverStartedAt: ctx.receivedAt,
    startedAt: hit.startedAt,
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(ctx.receivedAt + SESSION_RETENTION_DAYS * 86400000),

    visitorId: hit.visitorId,
    visitorHash: ctx.visitorHash,
    isNewVisitor: hit.isNewVisitor,
    visitCount: hit.visitCount,

    landingPath: hit.path,
    landingTitle: hit.title,
    referrer: hit.referrer,
    referrerHost: acquisition.referrerHost,
    channel: acquisition.channel,
    source: acquisition.source,
    campaign: acquisition.campaign,
    utm: {
      source: hit.acquisition.utmSource,
      medium: hit.acquisition.utmMedium,
      campaign: hit.acquisition.utmCampaign,
      term: hit.acquisition.utmTerm,
      content: hit.acquisition.utmContent,
    },
    clickIds: hit.acquisition.clickIds,
    refTag: hit.acquisition.refTag,

    country: ctx.geo.country,
    region: ctx.geo.region,
    city: ctx.geo.city,
    latitude: ctx.geo.latitude,
    longitude: ctx.geo.longitude,
    ipTimezone: ctx.geo.ipTimezone,

    userAgent: ctx.userAgent,
    fingerprint: ctx.fingerprint,
    deviceType: ctx.device.deviceType,
    browser: ctx.device.browser,
    browserVersion: ctx.device.browserVersion,
    os: ctx.device.os,
    osVersion: ctx.device.osVersion,
    vendor: ctx.device.vendor ?? env.uaPlatform,
    screenW: env.screenW,
    screenH: env.screenH,
    screenBucket: screenBucket(env.screenW),
    viewportW: env.viewportW,
    viewportH: env.viewportH,
    dpr: env.dpr,
    orientation: env.orientation,
    touch: env.touch,
    language: env.language,
    timezone: env.timezone,
    localHour: localHour(ctx.receivedAt, env.timezone ?? ctx.geo.ipTimezone),
    colorScheme: env.colorScheme,
    reducedMotion: env.reducedMotion,
    connection: env.connection,
    cores: env.cores,
    memoryGb: env.memoryGb,
    ttfbMs: env.ttfbMs,
    loadMs: env.loadMs,

    quality: verdict.quality,
    botScore: verdict.score,
    botName: verdict.botName,
    botCategory: verdict.botCategory,
    botReasons: verdict.reasons,

    // Filled in by session-end; present from the start so reads never branch.
    completed: false,
    durationMs: 0,
    activeMs: 0,
    pageviews: 1,
    maxScrollPct: 0,
    actions: [] as string[],
    downloads: 0,
  };
}

function dailyHitCounters(
  hit: HitPayload,
  ctx: ServerContext,
  acquisition: Acquisition,
  verdict: ReturnType<typeof classifyTraffic>,
) {
  const doc: Record<string, unknown> = {
    day: ctx.day,
    updatedAt: FieldValue.serverTimestamp(),
    [`${verdict.quality}Pageviews`]: inc(1),
  };
  if (!hit.isFirstHit) return doc;
  return {
    ...doc,
    ...dailySessionStart({
      verdict,
      ctx,
      acquisition,
      env: hit.env,
      landingPath: hit.path,
      isNewVisitor: hit.isNewVisitor,
      at: ctx.receivedAt,
    }),
  };
}

/**
 * The dimension counters a *new session* contributes to its day. Written once
 * per session — normally by its first hit, and by session-end instead when that
 * hit never made it (ad-blocked request, dropped connection, instant back-out).
 */
function dailySessionStart(args: {
  verdict: ReturnType<typeof classifyTraffic>;
  ctx: ServerContext;
  acquisition: Acquisition;
  env: ClientEnvironment;
  landingPath: string;
  isNewVisitor: boolean;
  at: number;
}): Record<string, unknown> {
  const { verdict, ctx, acquisition, env, landingPath, isNewVisitor, at } = args;
  const q = verdict.quality;
  const doc: Record<string, unknown> = { [`${q}Sessions`]: inc(1) };

  if (q === 'bot') {
    const botDims: Record<string, unknown> = {};
    dimension(botDims, 'botName', verdict.botName ?? 'Unnamed automation');
    dimension(botDims, 'botCategory', verdict.botCategory ?? 'other');
    doc.botDims = botDims;
    return doc;
  }

  const dims: Record<string, unknown> = {};
  dimension(dims, 'country', ctx.geo.country ?? 'unknown');
  dimension(dims, 'region', ctx.geo.region ? `${ctx.geo.country ?? '??'}-${ctx.geo.region}` : 'unknown');
  dimension(dims, 'city', ctx.geo.city ?? 'unknown');
  dimension(dims, 'deviceType', ctx.device.deviceType);
  dimension(dims, 'os', ctx.device.os);
  dimension(dims, 'browser', ctx.device.browser);
  dimension(dims, 'channel', acquisition.channel);
  dimension(dims, 'source', acquisition.source);
  dimension(dims, 'landing', landingPath);
  dimension(dims, 'language', env.language ?? 'unknown');
  dimension(dims, 'screen', screenBucket(env.screenW));
  dimension(dims, 'hour', String(localHour(at, env.timezone ?? ctx.geo.ipTimezone)).padStart(2, '0'));
  if (env.colorScheme) dimension(dims, 'colorScheme', env.colorScheme);
  if (acquisition.campaign) dimension(dims, 'campaign', acquisition.campaign);
  doc.dims = dims;
  doc[isNewVisitor ? 'newVisitors' : 'returningVisitors'] = inc(1);
  return doc;
}

// ------------------------------------------------------- session-end writing

export interface SessionEndResult {
  quality: TrafficQuality;
  durationMs: number;
  acquisition: Acquisition;
  device: ReturnType<typeof parseUserAgent>;
  geo: ReturnType<typeof readGeo>;
  pageCount: number;
  maxScrollPct: number;
  isBounce: boolean;
}

export async function recordSessionEnd(payload: SessionEndPayload, ctx: ServerContext): Promise<SessionEndResult> {
  const { pages, engagement, wallpaperViews } = payload;
  const durationMs = Math.max(0, Math.min(payload.endedAt - payload.startedAt, ANALYTICS_LIMITS.MAX_DWELL_MS));
  const maxScrollPct = pages.reduce((max, p) => Math.max(max, p.maxScrollPct), 0);
  const acquisition = classifyAcquisition(payload.referrer, utmOf(payload.acquisition), payload.acquisition.clickIds);
  const verdict = classifyTraffic({
    userAgent: ctx.userAgent,
    env: payload.env,
    pages,
    engagement,
    durationMs,
    acceptLanguage: ctx.acceptLanguage,
  });
  const isBot = verdict.quality === 'bot';
  // "Engaged" borrows GA4's definition: >10s, or >1 page, or a tracked action.
  const engaged = durationMs >= 10000 || pages.length > 1 || payload.actions.length > 0;
  const isBounce = pages.length <= 1 && !engaged;

  const sessionRef = db.collection(SESSIONS_COLLECTION).doc(payload.sessionId);
  // One read, once per session: did this session's opening hit actually land?
  // If it didn't (ad blocker, dropped request, instant back-out) this write has
  // to stand in for it — otherwise the visit would exist as behaviour with no
  // geo, device or source attached, and would never be counted as a session.
  const existing = await sessionRef.get();
  const hitLanded = existing.exists;

  const batch = db.batch();

  batch.set(
    sessionRef,
    {
      sessionId: payload.sessionId,
      day: ctx.day,
      // Only set if the hit never landed; `merge` keeps the earlier value when it did.
      expireAt: Timestamp.fromMillis(ctx.receivedAt + SESSION_RETENTION_DAYS * 86400000),
      completed: true,
      endedAt: payload.endedAt,
      serverEndedAt: ctx.receivedAt,
      durationMs,
      activeMs: engagement.activeMs,
      pageviews: pages.length,
      pages: pages.map((p) => ({
        path: p.path,
        title: p.title ?? null,
        enteredAt: p.enteredAt,
        dwellMs: Math.max(0, (p.exitedAt ?? payload.endedAt) - p.enteredAt),
        activeMs: p.activeMs ?? 0,
        maxScrollPct: p.maxScrollPct,
      })),
      exitPath: pages[pages.length - 1].path,
      maxScrollPct,
      engagement,
      engaged,
      bounced: isBounce,
      actions: payload.actions,
      purchased: payload.purchased,
      wallpaperViews: wallpaperViews.slice(0, 40),
      worldsSeen: [...new Set(wallpaperViews.map((w) => w.world))],
      quality: verdict.quality,
      botScore: verdict.score,
      botName: verdict.botName,
      botCategory: verdict.botCategory,
      botReasons: verdict.reasons,
      ...(hitLanded ? {} : fallbackFacts(payload, ctx, acquisition, verdict)),
    },
    { merge: true },
  );

  // Dwell per page. Views were already counted at hit time — not re-counted here.
  const byPath = groupBy(
    pages,
    (p) => pathSlug(p.path),
    (p) => Math.max(0, (p.exitedAt ?? payload.endedAt) - p.enteredAt),
  );
  const pathBySlug = new Map(pages.map((p) => [pathSlug(p.path), p.path]));
  for (const [slug, stat] of byPath) {
    batch.set(
      db.collection('page_stats').doc(slug),
      isBot
        ? {
            path: pathBySlug.get(slug),
            botDwellMs: inc(stat.dwellMs),
            ...(hitLanded ? {} : { botViews: inc(stat.count) }),
          }
        : {
            path: pathBySlug.get(slug),
            dwellMs: inc(stat.dwellMs),
            ...(hitLanded ? {} : { views: inc(stat.count) }),
            scrollPctSum: inc(pages.filter((p) => pathSlug(p.path) === slug).reduce((s, p) => s + p.maxScrollPct, 0)),
            scrollSamples: inc(stat.count),
            exits: inc(pathSlug(pages[pages.length - 1].path) === slug ? 1 : 0),
          },
      { merge: true },
    );
  }

  if (!isBot) {
    const byAsset = groupBy(
      wallpaperViews.filter((w) => w.assetId),
      (w) => w.assetId as string,
      (w) => w.dwellMs,
    );
    for (const [assetId, stat] of byAsset) {
      batch.set(
        db.collection('wallpaper_assets').doc(assetId),
        { views: inc(stat.count), dwellMs: inc(stat.dwellMs) },
        { merge: true },
      );
    }
    const byWorld = groupBy(wallpaperViews, (w) => w.world, (w) => w.dwellMs);
    for (const [world, stat] of byWorld) {
      batch.set(
        db.collection('world_stats').doc(world),
        { world, views: inc(stat.count), dwellMs: inc(stat.dwellMs) },
        { merge: true },
      );
    }
  }

  const daily: Record<string, unknown> = {
    day: ctx.day,
    updatedAt: FieldValue.serverTimestamp(),
    [`${verdict.quality}CompletedSessions`]: inc(1),
    [`${verdict.quality}DurationMs`]: inc(durationMs),
    // Stand in for the missing hit, so a lost beacon isn't a lost session.
    ...(hitLanded
      ? {}
      : {
          [`${verdict.quality}Pageviews`]: inc(pages.length),
          ...dailySessionStart({
            verdict,
            ctx,
            acquisition,
            env: payload.env,
            landingPath: pages[0].path,
            isNewVisitor: false,
            at: payload.startedAt,
          }),
        }),
  };
  if (!isBot) {
    daily.activeMs = inc(engagement.activeMs);
    daily.engagedSessions = inc(engaged ? 1 : 0);
    daily.bouncedSessions = inc(isBounce ? 1 : 0);
    daily.scrollPctSum = inc(maxScrollPct);
    if (payload.actions.length > 0) {
      const dims: Record<string, unknown> = {};
      for (const action of payload.actions) dimension(dims, 'action', action);
      daily.actionDims = dims;
      daily.sessionsWithAction = inc(1);
    }
  }
  batch.set(db.collection(DAILY_COLLECTION).doc(ctx.day), daily, { merge: true });

  await batch.commit();

  return {
    quality: verdict.quality,
    durationMs,
    acquisition,
    device: ctx.device,
    geo: ctx.geo,
    pageCount: pages.length,
    maxScrollPct,
    isBounce,
  };
}

/**
 * Fields normally stamped by the first hit, written only when that hit never
 * arrived — otherwise the visit would be behaviour with no geo, device or
 * source attached. `serverStartedAt` matters most: it's the field /admin sorts
 * and range-filters on, so it must never be absent (or, worse, zero).
 */
function fallbackFacts(
  payload: SessionEndPayload,
  ctx: ServerContext,
  acquisition: Acquisition,
  verdict: ReturnType<typeof classifyTraffic>,
) {
  const env = payload.env;
  return {
    // The session started before this beacon; derive it from the client clock
    // delta rather than the client's absolute time, which can be anything.
    serverStartedAt: ctx.receivedAt - Math.max(0, payload.endedAt - payload.startedAt),
    day: ctx.day,
    createdAt: FieldValue.serverTimestamp(),
    hitLanded: false,
    visitorId: payload.visitorId,
    visitorHash: ctx.visitorHash,
    landingPath: payload.pages[0].path,
    referrer: payload.referrer,
    referrerHost: acquisition.referrerHost,
    channel: acquisition.channel,
    source: acquisition.source,
    campaign: acquisition.campaign,
    country: ctx.geo.country,
    region: ctx.geo.region,
    city: ctx.geo.city,
    ipTimezone: ctx.geo.ipTimezone,
    userAgent: ctx.userAgent,
    fingerprint: ctx.fingerprint,
    deviceType: ctx.device.deviceType,
    browser: ctx.device.browser,
    browserVersion: ctx.device.browserVersion,
    os: ctx.device.os,
    osVersion: ctx.device.osVersion,
    vendor: ctx.device.vendor ?? env.uaPlatform,
    screenBucket: screenBucket(env.screenW),
    screenW: env.screenW,
    screenH: env.screenH,
    viewportW: env.viewportW,
    viewportH: env.viewportH,
    dpr: env.dpr,
    orientation: env.orientation,
    touch: env.touch,
    language: env.language,
    timezone: env.timezone,
    localHour: localHour(payload.startedAt, env.timezone ?? ctx.geo.ipTimezone),
    colorScheme: env.colorScheme,
    reducedMotion: env.reducedMotion,
    connection: env.connection,
    cores: env.cores,
    memoryGb: env.memoryGb,
    ttfbMs: env.ttfbMs,
    loadMs: env.loadMs,
    utm: {
      source: payload.acquisition.utmSource,
      medium: payload.acquisition.utmMedium,
      campaign: payload.acquisition.utmCampaign,
      term: payload.acquisition.utmTerm,
      content: payload.acquisition.utmContent,
    },
    clickIds: payload.acquisition.clickIds,
    refTag: payload.acquisition.refTag,
    quality: verdict.quality,
  };
}
