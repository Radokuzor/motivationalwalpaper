/**
 * Read-side helpers for /admin — survey responses + download stats.
 * Admin SDK only (Firestore rules stay deny-all); no composite indexes
 * needed since every filter here is applied in memory after a single
 * `orderBy` query.
 */
import { db } from './firebase';
import { WORLDS, worldByKey, type ProfileKey, type WorldKey } from '../data/worlds';
import { ASSET_COLLECTION, signedUrl, thumbPath } from './wallpaperAssets';

export const PROFILE_KEYS = WORLDS.filter((w) => w.profile).map((w) => w.profile as ProfileKey);
export const WORLD_KEYS_ALL = WORLDS.map((w) => w.key);

export interface DownloadedAsset {
  assetId: string | null;
  world: WorldKey;
  at: number;
}

export interface SurveyRow {
  id: string;
  status: string | null;
  age: string | null;
  gender: string | null;
  life: string | null;
  inspires: string[];
  phone: string | null;
  email: string | null;
  profile: ProfileKey | null;
  world: WorldKey | null;
  /** Display name (e.g. "Gym"), not the internal key — null if `world` is unset or unknown. */
  worldName: string | null;
  emailStatus: string | null;
  smsStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  /** Wallpaper(s) actually downloaded at capture — stamped by /api/downloads, oldest first. */
  downloadedAssets: DownloadedAsset[];
  /** Device the respondent took the survey on — parsed from the request's user-agent. */
  deviceType: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  /** Location, from Vercel's edge geo headers — no IP address is stored. */
  country: string | null;
  region: string | null;
  city: string | null;
}

export interface SurveyFilters {
  status?: string;
  profile?: string;
}

const RESPONSES_LIMIT = 500;

const isoOrNull = (v: unknown): string | null => {
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
};

const WORLD_KEY_SET = new Set<string>(WORLD_KEYS_ALL);

function parseDownloadedAssets(value: unknown): DownloadedAsset[] {
  if (!Array.isArray(value)) return [];
  const out: DownloadedAsset[] = [];
  for (const v of value) {
    if (!v || typeof v !== 'object') continue;
    const w = v as Record<string, unknown>;
    if (!WORLD_KEY_SET.has(w.world as string)) continue;
    out.push({
      assetId: typeof w.assetId === 'string' ? w.assetId : null,
      world: w.world as WorldKey,
      at: typeof w.at === 'number' ? w.at : 0,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function fetchSurveyResponses(filters: SurveyFilters): Promise<SurveyRow[]> {
  const snap = await db
    .collection('survey_responses')
    .orderBy('createdAt', 'desc')
    .limit(RESPONSES_LIMIT)
    .get();

  let rows: SurveyRow[] = snap.docs.map((doc) => {
    const d = doc.data();
    const world: WorldKey | null = WORLD_KEY_SET.has(d.world) ? d.world : null;
    return {
      id: doc.id,
      status: d.status ?? null,
      age: d.age ?? null,
      gender: d.gender ?? null,
      life: d.life ?? null,
      inspires: Array.isArray(d.inspires) ? d.inspires : [],
      phone: d.phone ?? null,
      email: d.email ?? null,
      profile: d.profile ?? null,
      world,
      worldName: world ? worldByKey(world).name : null,
      emailStatus: d.emailStatus ?? null,
      smsStatus: d.smsStatus ?? null,
      createdAt: isoOrNull(d.createdAt),
      updatedAt: isoOrNull(d.updatedAt),
      completedAt: isoOrNull(d.completedAt),
      downloadedAssets: parseDownloadedAssets(d.downloadedAssets),
      deviceType: d.deviceType ?? null,
      browser: d.browser ?? null,
      browserVersion: d.browserVersion ?? null,
      os: d.os ?? null,
      osVersion: d.osVersion ?? null,
      country: d.country ?? null,
      region: d.region ?? null,
      city: d.city ?? null,
    };
  });

  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.profile) rows = rows.filter((r) => r.profile === filters.profile);

  return rows;
}

/** Batch-resolve signed thumbnail URLs for a set of wallpaper_assets ids —
 *  used to render download snippets in the survey table without an N+1
 *  round trip per row. Missing/deleted assets are silently omitted. */
export async function fetchAssetThumbs(assetIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(assetIds)];
  if (unique.length === 0) return new Map();
  const refs = unique.map((id) => db.collection(ASSET_COLLECTION).doc(id));
  const docs = await db.getAll(...refs);
  const entries = await Promise.all(
    docs.map(async (doc) => {
      if (!doc.exists) return null;
      const storageThumb = doc.data()?.storageThumb;
      if (typeof storageThumb !== 'string') return null;
      try {
        return [doc.id, await signedUrl(storageThumb, 60 * 60 * 1000)] as const;
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is readonly [string, string] => e !== null));
}

export interface SurveySummary {
  total: number;
  byStatus: Record<string, number>;
  byProfile: Record<string, number>;
}

export function summarizeSurvey(rows: SurveyRow[]): SurveySummary {
  const byStatus: Record<string, number> = {};
  const byProfile: Record<string, number> = {};
  for (const r of rows) {
    const status = r.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (r.profile) byProfile[r.profile] = (byProfile[r.profile] ?? 0) + 1;
  }
  return { total: rows.length, byStatus, byProfile };
}

export interface WorldStat {
  world: WorldKey;
  name: string;
  downloads: number;
  views: number;
  dwellMs: number;
}

/** Per-category totals — reads the small `world_stats` collection (one doc per world). */
export async function fetchWorldStats(): Promise<WorldStat[]> {
  const snap = await db.collection('world_stats').get();
  const byWorld = new Map<string, { downloads: number; views: number; dwellMs: number }>();
  for (const doc of snap.docs) {
    const d = doc.data();
    byWorld.set(doc.id, {
      downloads: typeof d.downloads === 'number' ? d.downloads : 0,
      views: typeof d.views === 'number' ? d.views : 0,
      dwellMs: typeof d.dwellMs === 'number' ? d.dwellMs : 0,
    });
  }
  return WORLDS.map((w) => ({ world: w.key, name: w.name, ...(byWorld.get(w.key) ?? { downloads: 0, views: 0, dwellMs: 0 }) }))
    .sort((a, b) => b.downloads - a.downloads);
}

export interface TopAsset {
  id: string;
  downloads: number;
  views: number;
  dwellMs: number;
  worlds: WorldKey[];
  preferred: boolean;
  thumbUrl: string | null;
}

async function assetDocToTopAsset(doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<TopAsset> {
  const d = doc.data();
  let thumbUrl: string | null = null;
  if (typeof d.storageThumb === 'string') {
    try {
      thumbUrl = await signedUrl(d.storageThumb, 60 * 60 * 1000);
    } catch {
      thumbUrl = null;
    }
  }
  return {
    id: doc.id,
    downloads: typeof d.downloads === 'number' ? d.downloads : 0,
    views: typeof d.views === 'number' ? d.views : 0,
    dwellMs: typeof d.dwellMs === 'number' ? d.dwellMs : 0,
    worlds: Array.isArray(d.worlds) ? d.worlds : [],
    preferred: Boolean(d.preferred),
    thumbUrl,
  };
}

/** Top wallpapers by download count. Single orderBy — no composite index. */
export async function fetchTopAssets(limit = 20): Promise<TopAsset[]> {
  const snap = await db.collection(ASSET_COLLECTION).orderBy('downloads', 'desc').limit(limit).get();
  return Promise.all(snap.docs.map(assetDocToTopAsset));
}

export interface RankableAsset {
  id: string;
  thumbUrl: string | null;
  worlds: WorldKey[];
  /** 1–10, the operator's pinned feed position — see AssetDoc.rank. Null = unranked (random in the feed). */
  rank: number | null;
}

/**
 * Every sorted (filed) wallpaper, for the /admin/content "feed ranking"
 * picker — needs the full catalog, not just the top-N by some metric, since
 * an operator may want to rank a brand-new photo with zero downloads yet.
 */
export async function fetchRankableAssets(limit = 500): Promise<RankableAsset[]> {
  const snap = await db.collection(ASSET_COLLECTION).where('status', '==', 'sorted').limit(limit).get();
  const rows = await Promise.all(
    snap.docs.map(async (doc) => {
      const d = doc.data();
      let thumbUrl: string | null = null;
      try {
        thumbUrl = await signedUrl(d.storageThumb ?? thumbPath(doc.id), 60 * 60 * 1000);
      } catch {
        thumbUrl = null;
      }
      return {
        id: doc.id,
        thumbUrl,
        worlds: (Array.isArray(d.worlds) ? d.worlds : []) as WorldKey[],
        rank: typeof d.rank === 'number' ? d.rank : null,
      };
    }),
  );
  // Ranked first (in rank order — mirrors the feed), then unranked by id for a stable list.
  return rows.sort((a, b) => {
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    if (a.rank !== null) return -1;
    if (b.rank !== null) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Most-viewed wallpapers (reel/category-grid time-on-screen events). Single orderBy. */
export async function fetchMostViewedAssets(limit = 20): Promise<TopAsset[]> {
  const snap = await db.collection(ASSET_COLLECTION).orderBy('views', 'desc').limit(limit).get();
  return Promise.all(snap.docs.map(assetDocToTopAsset));
}

/** Wallpapers with the most cumulative time-on-screen across all visitors. Single orderBy. */
export async function fetchMostDwelledAssets(limit = 20): Promise<TopAsset[]> {
  const snap = await db.collection(ASSET_COLLECTION).orderBy('dwellMs', 'desc').limit(limit).get();
  return Promise.all(snap.docs.map(assetDocToTopAsset));
}

export interface PageStat {
  path: string;
  title: string | null;
  views: number;
  dwellMs: number;
  /** Bot page loads, counted separately so they never inflate `views`. */
  botViews: number;
  /** Mean of each visit's deepest scroll point, 0–100. */
  avgScrollPct: number;
  /** Sessions that ended on this page. */
  exits: number;
}

/**
 * Lifetime page totals — these counters are incremented on every page load by
 * /api/analytics/hit, so unlike the session-based dashboards they survive raw
 * session expiry and never miss a view to a dropped exit beacon.
 */
export async function fetchTopPages(limit = 20): Promise<PageStat[]> {
  const snap = await db.collection('page_stats').orderBy('views', 'desc').limit(limit).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const num = (v: unknown) => (typeof v === 'number' ? v : 0);
    const samples = num(d.scrollSamples);
    return {
      path: typeof d.path === 'string' ? d.path : doc.id,
      title: typeof d.title === 'string' ? d.title : null,
      views: num(d.views),
      dwellMs: num(d.dwellMs),
      botViews: num(d.botViews),
      avgScrollPct: samples > 0 ? num(d.scrollPctSum) / samples : 0,
      exits: num(d.exits),
    };
  });
}

export interface ReferrerStat {
  bucket: string;
  sessions: number;
}

/** Traffic sources ("where people came from") — 'direct' means no referrer. */
export async function fetchTrafficSources(limit = 20): Promise<ReferrerStat[]> {
  const snap = await db.collection('referrer_stats').orderBy('sessions', 'desc').limit(limit).get();
  return snap.docs.map((doc) => ({
    bucket: doc.id,
    sessions: typeof doc.data().sessions === 'number' ? doc.data().sessions : 0,
  }));
}

export interface EntryPageStat {
  path: string;
  sessions: number;
}

/** Landing pages ("entry point of the website") — first page of each session. */
export async function fetchEntryPages(limit = 20): Promise<EntryPageStat[]> {
  const snap = await db.collection('entry_page_stats').orderBy('sessions', 'desc').limit(limit).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      path: typeof d.path === 'string' ? d.path : doc.id,
      sessions: typeof d.sessions === 'number' ? d.sessions : 0,
    };
  });
}

/** CSV field escaping — quotes a field if it contains a comma, quote, or newline. */
export function csvField(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: SurveyRow[]): string {
  const header = [
    'createdAt',
    'updatedAt',
    'completedAt',
    'status',
    'profile',
    'world',
    'email',
    'phone',
    'age',
    'gender',
    'life',
    'inspires',
    'emailStatus',
    'smsStatus',
    'downloadedAssetIds',
    'deviceType',
    'browser',
    'os',
    'country',
    'region',
    'city',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt,
        r.updatedAt,
        r.completedAt,
        r.status,
        r.profile,
        r.worldName ?? r.world,
        r.email,
        r.phone,
        r.age,
        r.gender,
        r.life,
        r.inspires.join('; '),
        r.emailStatus,
        r.smsStatus,
        r.downloadedAssets.map((a) => a.assetId).filter(Boolean).join('; '),
        r.deviceType,
        [r.browser, r.browserVersion].filter(Boolean).join(' '),
        [r.os, r.osVersion].filter(Boolean).join(' '),
        r.country,
        r.region,
        r.city,
      ]
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\n');
}
