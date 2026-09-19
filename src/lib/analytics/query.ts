/**
 * Read side of the analytics system — everything /admin/traffic renders.
 *
 * The shape of the work: pull the raw session documents for a date range in one
 * query (single-field range + orderBy on `serverStartedAt`, so no composite
 * index is needed), then do all filtering and grouping in memory. For a site at
 * this scale that's both cheaper and far more flexible than pre-aggregating
 * every combination — any dimension can be crossed with any filter without a
 * schema change.
 *
 * The durable `analytics_daily` rollups are read separately, for the long-range
 * view that outlives raw-session retention.
 */
import { db } from '../firebase';
import { DAILY_COLLECTION, SESSIONS_COLLECTION } from './session';
import { CHANNEL_LABELS, type Channel } from './sources';
import { QUALITY_LABELS, type TrafficQuality } from './bots';
import type { DeviceType } from './ua';

export { CHANNEL_LABELS, QUALITY_LABELS };
export type { Channel, TrafficQuality };

/** Hard ceiling on one dashboard query. Plenty for this site; a real guard rail. */
const MAX_SESSIONS = 4000;

export interface SessionPageRow {
  path: string;
  title: string | null;
  dwellMs: number;
  activeMs: number;
  maxScrollPct: number;
}

export interface SessionRow {
  id: string;
  day: string;
  startedAt: number;
  quality: TrafficQuality;
  botScore: number;
  botName: string | null;
  botCategory: string | null;
  botReasons: string[];

  visitorId: string | null;
  visitorHash: string | null;
  isNewVisitor: boolean;
  visitCount: number;

  channel: Channel;
  source: string;
  campaign: string | null;
  referrer: string | null;
  referrerHost: string | null;
  utmMedium: string | null;
  refTag: string | null;

  landingPath: string;
  exitPath: string | null;
  pages: SessionPageRow[];
  pageviews: number;

  country: string | null;
  region: string | null;
  city: string | null;

  deviceType: DeviceType;
  os: string;
  osVersion: string | null;
  browser: string;
  browserVersion: string | null;
  screenBucket: string;
  screenW: number;
  screenH: number;
  viewportW: number;
  viewportH: number;
  orientation: string | null;

  language: string | null;
  timezone: string | null;
  localHour: number;
  colorScheme: string | null;
  connection: string | null;
  ttfbMs: number | null;
  loadMs: number | null;

  durationMs: number;
  activeMs: number;
  maxScrollPct: number;
  engaged: boolean;
  bounced: boolean;
  clicks: number;
  outbound: string[];
  actions: string[];
  purchased: boolean;
  worldsSeen: string[];
  completed: boolean;
  userAgent: string | null;
}

const s = (v: unknown, fallback: string | null = null): string | null => (typeof v === 'string' && v ? v : fallback);
const n = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function toRow(doc: FirebaseFirestore.QueryDocumentSnapshot): SessionRow {
  const d = doc.data();
  const engagement = (d.engagement ?? {}) as Record<string, unknown>;
  const rawPages = Array.isArray(d.pages) ? d.pages : [];
  const pages: SessionPageRow[] = rawPages.map((p: Record<string, unknown>) => ({
    path: s(p.path, '/') as string,
    title: s(p.title),
    dwellMs: n(p.dwellMs),
    activeMs: n(p.activeMs),
    maxScrollPct: n(p.maxScrollPct),
  }));
  // A session whose exit beacon never arrived still has its per-hit path trail.
  const hitPaths = Array.isArray(d.hitPaths) ? (d.hitPaths as Array<Record<string, unknown>>) : [];
  const fallbackPages: SessionPageRow[] =
    pages.length > 0
      ? pages
      : hitPaths
          .slice()
          .sort((a, b) => n(a.i) - n(b.i))
          .map((h) => ({ path: s(h.path, '/') as string, title: null, dwellMs: 0, activeMs: 0, maxScrollPct: 0 }));

  const quality = (['human', 'suspect', 'bot'] as const).includes(d.quality) ? (d.quality as TrafficQuality) : 'human';

  return {
    id: doc.id,
    day: s(d.day, '') as string,
    startedAt: n(d.serverStartedAt, n(d.startedAt)),
    quality,
    botScore: n(d.botScore),
    botName: s(d.botName),
    botCategory: s(d.botCategory),
    botReasons: arr(d.botReasons),

    visitorId: s(d.visitorId),
    visitorHash: s(d.visitorHash),
    isNewVisitor: d.isNewVisitor === true,
    visitCount: n(d.visitCount, 1),

    channel: (s(d.channel, 'direct') as Channel) ?? 'direct',
    source: s(d.source, 'Direct') as string,
    campaign: s(d.campaign),
    referrer: s(d.referrer),
    referrerHost: s(d.referrerHost),
    utmMedium: s((d.utm as Record<string, unknown> | undefined)?.medium),
    refTag: s(d.refTag),

    landingPath: s(d.landingPath, fallbackPages[0]?.path ?? '/') as string,
    exitPath: s(d.exitPath, fallbackPages[fallbackPages.length - 1]?.path ?? null),
    pages: fallbackPages,
    pageviews: n(d.pageviews, n(d.hitPageviews, fallbackPages.length || 1)),

    country: s(d.country),
    region: s(d.region),
    city: s(d.city),

    deviceType: (s(d.deviceType, 'unknown') as DeviceType) ?? 'unknown',
    os: s(d.os, 'Unknown') as string,
    osVersion: s(d.osVersion),
    browser: s(d.browser, 'Unknown') as string,
    browserVersion: s(d.browserVersion),
    screenBucket: s(d.screenBucket, 'unknown') as string,
    screenW: n(d.screenW),
    screenH: n(d.screenH),
    viewportW: n(d.viewportW),
    viewportH: n(d.viewportH),
    orientation: s(d.orientation),

    language: s(d.language),
    timezone: s(d.timezone),
    localHour: n(d.localHour),
    colorScheme: s(d.colorScheme),
    connection: s(d.connection),
    ttfbMs: typeof d.ttfbMs === 'number' ? d.ttfbMs : null,
    loadMs: typeof d.loadMs === 'number' ? d.loadMs : null,

    durationMs: n(d.durationMs),
    activeMs: n(d.activeMs),
    maxScrollPct: n(d.maxScrollPct),
    engaged: d.engaged === true,
    bounced: d.bounced === true,
    clicks: n(engagement.clicks),
    outbound: arr(engagement.outbound),
    actions: arr(d.actions),
    purchased: d.purchased === true,
    worldsSeen: arr(d.worldsSeen),
    completed: d.completed === true,
    userAgent: s(d.userAgent),
  };
}

export interface RangeQuery {
  fromMs: number;
  toMs: number;
  limit?: number;
}

/** Raw sessions for a window, newest first. */
export async function fetchSessions({ fromMs, toMs, limit = MAX_SESSIONS }: RangeQuery): Promise<SessionRow[]> {
  const snap = await db
    .collection(SESSIONS_COLLECTION)
    .where('serverStartedAt', '>=', fromMs)
    .where('serverStartedAt', '<=', toMs)
    .orderBy('serverStartedAt', 'desc')
    .limit(Math.min(limit, MAX_SESSIONS))
    .get();
  return snap.docs.map(toRow);
}

// ------------------------------------------------------------------ filtering

export interface SessionFilters {
  /** 'human' (default) | 'humans_and_suspects' | 'bot' | 'all' */
  quality: string;
  device: string;
  country: string;
  channel: string;
  source: string;
  landing: string;
  campaign: string;
  /** 'new' | 'returning' | '' */
  visitor: string;
}

export const EMPTY_FILTERS: SessionFilters = {
  quality: 'human',
  device: '',
  country: '',
  channel: '',
  source: '',
  landing: '',
  campaign: '',
  visitor: '',
};

export function applyFilters(rows: SessionRow[], f: SessionFilters): SessionRow[] {
  return rows.filter((r) => {
    if (f.quality === 'human' && r.quality !== 'human') return false;
    if (f.quality === 'humans_and_suspects' && r.quality === 'bot') return false;
    if (f.quality === 'suspect' && r.quality !== 'suspect') return false;
    if (f.quality === 'bot' && r.quality !== 'bot') return false;
    if (f.device && r.deviceType !== f.device) return false;
    if (f.country && (r.country ?? 'unknown') !== f.country) return false;
    if (f.channel && r.channel !== f.channel) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.landing && r.landingPath !== f.landing) return false;
    if (f.campaign && (r.campaign ?? '') !== f.campaign) return false;
    if (f.visitor === 'new' && !r.isNewVisitor) return false;
    if (f.visitor === 'returning' && r.isNewVisitor) return false;
    return true;
  });
}

// ---------------------------------------------------------------- aggregation

export interface Kpis {
  sessions: number;
  visitors: number;
  pageviews: number;
  pagesPerSession: number;
  avgDurationMs: number;
  medianDurationMs: number;
  avgActiveMs: number;
  bounceRate: number;
  engagementRate: number;
  avgScrollPct: number;
  newVisitorShare: number;
  actionSessions: number;
  conversionRate: number;
  downloads: number;
  botShare: number;
  suspectShare: number;
  avgTtfbMs: number | null;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

/**
 * `all` is the unfiltered set for the same window — needed for the bot share,
 * which is meaningless when computed over a humans-only selection.
 */
export function computeKpis(rows: SessionRow[], all: SessionRow[]): Kpis {
  const sessions = rows.length;
  const visitors = new Set(rows.map((r) => r.visitorId ?? r.visitorHash ?? r.id)).size;
  const pageviews = rows.reduce((sum, r) => sum + r.pageviews, 0);
  const completed = rows.filter((r) => r.completed);
  const durations = completed.map((r) => r.durationMs);
  const actionSessions = rows.filter((r) => r.actions.length > 0).length;
  const downloads = rows.reduce((sum, r) => sum + r.actions.filter((a) => /download/i.test(a)).length, 0);
  const ttfbs = rows.map((r) => r.ttfbMs).filter((t): t is number => typeof t === 'number' && t > 0);

  return {
    sessions,
    visitors,
    pageviews,
    pagesPerSession: sessions === 0 ? 0 : pageviews / sessions,
    avgDurationMs: mean(durations),
    medianDurationMs: median(durations),
    avgActiveMs: mean(completed.map((r) => r.activeMs)),
    bounceRate: completed.length === 0 ? 0 : completed.filter((r) => r.bounced).length / completed.length,
    engagementRate: completed.length === 0 ? 0 : completed.filter((r) => r.engaged).length / completed.length,
    avgScrollPct: mean(completed.map((r) => r.maxScrollPct)),
    newVisitorShare: sessions === 0 ? 0 : rows.filter((r) => r.isNewVisitor).length / sessions,
    actionSessions,
    conversionRate: sessions === 0 ? 0 : actionSessions / sessions,
    downloads,
    botShare: all.length === 0 ? 0 : all.filter((r) => r.quality === 'bot').length / all.length,
    suspectShare: all.length === 0 ? 0 : all.filter((r) => r.quality === 'suspect').length / all.length,
    avgTtfbMs: ttfbs.length === 0 ? null : mean(ttfbs),
  };
}

export interface BreakdownRow {
  key: string;
  label: string;
  sessions: number;
  pageviews: number;
  avgDurationMs: number;
  bounceRate: number;
  conversions: number;
  share: number;
}

/** Group sessions by any dimension, with the same metric set every time. */
export function breakdown(
  rows: SessionRow[],
  keyFn: (r: SessionRow) => string | null,
  labelFn: (key: string) => string = (k) => k,
  limit = 15,
): BreakdownRow[] {
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const total = rows.length || 1;
  return [...groups.entries()]
    .map(([key, group]) => {
      const completed = group.filter((r) => r.completed);
      return {
        key,
        label: labelFn(key),
        sessions: group.length,
        pageviews: group.reduce((sum, r) => sum + r.pageviews, 0),
        avgDurationMs: mean(completed.map((r) => r.durationMs)),
        bounceRate: completed.length === 0 ? 0 : completed.filter((r) => r.bounced).length / completed.length,
        conversions: group.filter((r) => r.actions.length > 0).length,
        share: group.length / total,
      };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

export interface PageRow {
  path: string;
  title: string | null;
  views: number;
  avgDwellMs: number;
  avgScrollPct: number;
  entrances: number;
  exits: number;
  exitRate: number;
}

/** Page-level table built from the page chains inside the filtered sessions. */
export function pageBreakdown(rows: SessionRow[], limit = 20): PageRow[] {
  const map = new Map<string, { title: string | null; dwell: number[]; scroll: number[]; entrances: number; exits: number }>();
  for (const session of rows) {
    session.pages.forEach((page, index) => {
      const entry = map.get(page.path) ?? { title: page.title, dwell: [], scroll: [], entrances: 0, exits: 0 };
      if (!entry.title && page.title) entry.title = page.title;
      if (page.dwellMs > 0) entry.dwell.push(page.dwellMs);
      entry.scroll.push(page.maxScrollPct);
      if (index === 0) entry.entrances += 1;
      if (index === session.pages.length - 1) entry.exits += 1;
      map.set(page.path, entry);
    });
  }
  return [...map.entries()]
    .map(([path, e]) => {
      const views = e.scroll.length;
      return {
        path,
        title: e.title,
        views,
        avgDwellMs: mean(e.dwell),
        avgScrollPct: mean(e.scroll),
        entrances: e.entrances,
        exits: e.exits,
        exitRate: views === 0 ? 0 : e.exits / views,
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

export interface DayPoint {
  day: string;
  humans: number;
  suspects: number;
  bots: number;
  pageviews: number;
  conversions: number;
}

/** Dense per-day series — every day in the window, zeros included. */
export function dailySeries(all: SessionRow[], fromMs: number, toMs: number): DayPoint[] {
  const byDay = new Map<string, DayPoint>();
  for (let t = fromMs; t <= toMs + 86400000; t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (new Date(day).getTime() > toMs) break;
    byDay.set(day, { day, humans: 0, suspects: 0, bots: 0, pageviews: 0, conversions: 0 });
  }
  for (const row of all) {
    const day = new Date(row.startedAt).toISOString().slice(0, 10);
    const point = byDay.get(day);
    if (!point) continue;
    if (row.quality === 'bot') point.bots += 1;
    else if (row.quality === 'suspect') point.suspects += 1;
    else point.humans += 1;
    point.pageviews += row.pageviews;
    if (row.actions.length > 0) point.conversions += 1;
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Sessions per local hour of day (0–23), for "when are people actually here". */
export function hourHistogram(rows: SessionRow[]): number[] {
  const hours = new Array(24).fill(0) as number[];
  for (const row of rows) {
    const hour = Math.max(0, Math.min(23, Math.round(row.localHour)));
    hours[hour] += 1;
  }
  return hours;
}

/** Every distinct action label, counted — the closest thing here to "goals". */
export function actionCounts(rows: SessionRow[]): Array<{ label: string; sessions: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const action of new Set(row.actions)) counts.set(action, (counts.get(action) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, sessions]) => ({ label, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
}

/** Landing page → conversion rate, the table that answers "what should I write more of". */
export function landingPerformance(rows: SessionRow[], limit = 15): BreakdownRow[] {
  return breakdown(rows, (r) => r.landingPath, (k) => k, limit);
}

/** Distinct values for the filter dropdowns, most common first. */
export function filterOptions(rows: SessionRow[]) {
  const distinct = (keyFn: (r: SessionRow) => string | null) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = keyFn(row);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  };
  return {
    countries: distinct((r) => r.country),
    devices: distinct((r) => r.deviceType),
    channels: distinct((r) => r.channel),
    sources: distinct((r) => r.source).slice(0, 40),
    landings: distinct((r) => r.landingPath).slice(0, 40),
    campaigns: distinct((r) => r.campaign).slice(0, 40),
  };
}

// -------------------------------------------------------------- daily rollups

export interface DailyRollup {
  day: string;
  humanSessions: number;
  suspectSessions: number;
  botSessions: number;
  humanPageviews: number;
  botPageviews: number;
  newVisitors: number;
  returningVisitors: number;
  humanDurationMs: number;
  humanCompletedSessions: number;
  bouncedSessions: number;
  engagedSessions: number;
  sessionsWithAction: number;
}

/**
 * Durable counters, read straight from `analytics_daily`. Raw sessions expire;
 * these don't, so the long-range trend and lifetime totals still work after the
 * detail is gone.
 */
export async function fetchDailyRollups(fromDay: string, toDay: string): Promise<DailyRollup[]> {
  const snap = await db
    .collection(DAILY_COLLECTION)
    .where('day', '>=', fromDay)
    .where('day', '<=', toDay)
    .orderBy('day', 'asc')
    .limit(800)
    .get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      day: s(d.day, doc.id) as string,
      humanSessions: n(d.humanSessions),
      suspectSessions: n(d.suspectSessions),
      botSessions: n(d.botSessions),
      humanPageviews: n(d.humanPageviews),
      botPageviews: n(d.botPageviews),
      newVisitors: n(d.newVisitors),
      returningVisitors: n(d.returningVisitors),
      humanDurationMs: n(d.humanDurationMs),
      humanCompletedSessions: n(d.humanCompletedSessions),
      bouncedSessions: n(d.bouncedSessions),
      engagedSessions: n(d.engagedSessions),
      sessionsWithAction: n(d.sessionsWithAction),
    };
  });
}

// --------------------------------------------------------------------- export

const csvField = (value: unknown): string => {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export function sessionsToCsv(rows: SessionRow[]): string {
  const header = [
    'startedAt',
    'sessionId',
    'quality',
    'botScore',
    'botName',
    'botReasons',
    'visitorId',
    'newVisitor',
    'visitCount',
    'channel',
    'source',
    'campaign',
    'referrer',
    'landingPath',
    'exitPath',
    'pageviews',
    'pageChain',
    'durationMs',
    'activeMs',
    'maxScrollPct',
    'bounced',
    'engaged',
    'actions',
    'country',
    'region',
    'city',
    'deviceType',
    'os',
    'osVersion',
    'browser',
    'browserVersion',
    'screenW',
    'screenH',
    'viewportW',
    'viewportH',
    'language',
    'timezone',
    'localHour',
    'colorScheme',
    'connection',
    'ttfbMs',
    'worldsSeen',
    'userAgent',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.startedAt).toISOString(),
        r.id,
        r.quality,
        r.botScore,
        r.botName,
        r.botReasons.join('; '),
        r.visitorId,
        r.isNewVisitor,
        r.visitCount,
        r.channel,
        r.source,
        r.campaign,
        r.referrer,
        r.landingPath,
        r.exitPath,
        r.pageviews,
        r.pages.map((p) => p.path).join(' > '),
        r.durationMs,
        r.activeMs,
        r.maxScrollPct,
        r.bounced,
        r.engaged,
        r.actions.join('; '),
        r.country,
        r.region,
        r.city,
        r.deviceType,
        r.os,
        r.osVersion,
        r.browser,
        r.browserVersion,
        r.screenW,
        r.screenH,
        r.viewportW,
        r.viewportH,
        r.language,
        r.timezone,
        r.localHour,
        r.colorScheme,
        r.connection,
        r.ttfbMs,
        r.worldsSeen.join('; '),
        r.userAgent,
      ]
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\n');
}
