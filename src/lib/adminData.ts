/**
 * Read-side helpers for /admin — survey responses + download stats.
 * Admin SDK only (Firestore rules stay deny-all); no composite indexes
 * needed since every filter here is applied in memory after a single
 * `orderBy` query.
 */
import { db } from './firebase';
import { WORLDS, type ProfileKey, type WorldKey } from '../data/worlds';
import { ASSET_COLLECTION, signedUrl } from './wallpaperAssets';

export const PROFILE_KEYS = WORLDS.filter((w) => w.profile).map((w) => w.profile as ProfileKey);
export const WORLD_KEYS_ALL = WORLDS.map((w) => w.key);

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
  emailStatus: string | null;
  smsStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
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

export async function fetchSurveyResponses(filters: SurveyFilters): Promise<SurveyRow[]> {
  const snap = await db
    .collection('survey_responses')
    .orderBy('createdAt', 'desc')
    .limit(RESPONSES_LIMIT)
    .get();

  let rows: SurveyRow[] = snap.docs.map((doc) => {
    const d = doc.data();
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
      world: d.world ?? null,
      emailStatus: d.emailStatus ?? null,
      smsStatus: d.smsStatus ?? null,
      createdAt: isoOrNull(d.createdAt),
      updatedAt: isoOrNull(d.updatedAt),
      completedAt: isoOrNull(d.completedAt),
    };
  });

  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.profile) rows = rows.filter((r) => r.profile === filters.profile);

  return rows;
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
}

/** Per-category download totals — reads the small `world_stats` collection (one doc per world). */
export async function fetchWorldStats(): Promise<WorldStat[]> {
  const snap = await db.collection('world_stats').get();
  const counts = new Map<string, number>();
  for (const doc of snap.docs) {
    const d = doc.data();
    counts.set(doc.id, typeof d.downloads === 'number' ? d.downloads : 0);
  }
  return WORLDS.map((w) => ({ world: w.key, name: w.name, downloads: counts.get(w.key) ?? 0 })).sort(
    (a, b) => b.downloads - a.downloads,
  );
}

export interface TopAsset {
  id: string;
  downloads: number;
  worlds: WorldKey[];
  preferred: boolean;
  thumbUrl: string | null;
}

/** Top wallpapers by download count. Single orderBy — no composite index. */
export async function fetchTopAssets(limit = 20): Promise<TopAsset[]> {
  const snap = await db
    .collection(ASSET_COLLECTION)
    .orderBy('downloads', 'desc')
    .limit(limit)
    .get();

  return Promise.all(
    snap.docs.map(async (doc) => {
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
        worlds: Array.isArray(d.worlds) ? d.worlds : [],
        preferred: Boolean(d.preferred),
        thumbUrl,
      };
    }),
  );
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
        r.world,
        r.email,
        r.phone,
        r.age,
        r.gender,
        r.life,
        r.inspires.join('; '),
        r.emailStatus,
        r.smsStatus,
      ]
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\n');
}
