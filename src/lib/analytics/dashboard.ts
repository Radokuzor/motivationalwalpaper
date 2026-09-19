/**
 * Dashboard request plumbing — URL search params in, a query window and a
 * filter set out. Shared by every /admin analytics page and the CSV export so
 * a link pasted from one screen means exactly the same thing on the next.
 *
 * Every control on the dashboard is a plain GET parameter: the whole state of a
 * view is its URL, which can be bookmarked, shared, or diffed against another.
 */
import { EMPTY_FILTERS, type SessionFilters } from './query';

export type RangePreset = 'today' | '7d' | '28d' | '90d' | 'custom';

export interface DateRange {
  preset: RangePreset;
  fromMs: number;
  toMs: number;
  /** Same length, immediately before — the baseline every KPI is compared to. */
  prevFromMs: number;
  prevToMs: number;
  days: number;
  label: string;
  fromDay: string;
  toDay: string;
}

const DAY_MS = 86400000;

export const RANGE_PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '28d', label: 'Last 28 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom…' },
];

const dayStart = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const parseDay = (value: string | null): number | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
};

export function parseRange(params: URLSearchParams, now = Date.now()): DateRange {
  const preset = (params.get('range') ?? '28d') as RangePreset;
  const todayStart = dayStart(now);
  const customFrom = parseDay(params.get('from'));
  const customTo = parseDay(params.get('to'));

  let fromMs: number;
  let toMs = todayStart + DAY_MS - 1;
  let resolved: RangePreset = preset;

  if (preset === 'custom' && customFrom !== null) {
    fromMs = customFrom;
    toMs = (customTo ?? todayStart) + DAY_MS - 1;
  } else if (preset === 'today') {
    fromMs = todayStart;
  } else if (preset === '7d') {
    fromMs = todayStart - 6 * DAY_MS;
  } else if (preset === '90d') {
    fromMs = todayStart - 89 * DAY_MS;
  } else {
    resolved = '28d';
    fromMs = todayStart - 27 * DAY_MS;
  }

  const days = Math.max(1, Math.round((toMs - fromMs) / DAY_MS));
  const span = toMs - fromMs + 1;
  const preset_label = RANGE_PRESETS.find((r) => r.value === resolved)?.label ?? 'Custom';

  return {
    preset: resolved,
    fromMs,
    toMs,
    prevFromMs: fromMs - span,
    prevToMs: fromMs - 1,
    days,
    label: resolved === 'custom' ? `${new Date(fromMs).toISOString().slice(0, 10)} → ${new Date(toMs).toISOString().slice(0, 10)}` : preset_label,
    fromDay: new Date(fromMs).toISOString().slice(0, 10),
    toDay: new Date(toMs).toISOString().slice(0, 10),
  };
}

export function parseFilters(params: URLSearchParams): SessionFilters {
  const get = (key: string, fallback = '') => (params.get(key) ?? fallback).slice(0, 120);
  return {
    ...EMPTY_FILTERS,
    quality: get('quality', 'human'),
    device: get('device'),
    country: get('country'),
    channel: get('channel'),
    source: get('source'),
    landing: get('landing'),
    campaign: get('campaign'),
    visitor: get('visitor'),
  };
}

/** Rebuild the current view's query string, optionally overriding one key. */
export function queryString(params: URLSearchParams, overrides: Record<string, string> = {}): string {
  const next = new URLSearchParams();
  const keep = ['range', 'from', 'to', 'quality', 'device', 'country', 'channel', 'source', 'landing', 'campaign', 'visitor'];
  for (const key of keep) {
    const value = overrides[key] ?? params.get(key) ?? '';
    if (value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!keep.includes(key) && value) next.set(key, value);
  }
  const str = next.toString();
  return str ? `?${str}` : '';
}

export const QUALITY_OPTIONS = [
  { value: 'human', label: 'Humans only' },
  { value: 'humans_and_suspects', label: 'Humans + suspected bots' },
  { value: 'suspect', label: 'Suspected bots only' },
  { value: 'bot', label: 'Confirmed bots only' },
  { value: 'all', label: 'Everything (unfiltered)' },
];

export const VISITOR_OPTIONS = [
  { value: '', label: 'All visitors' },
  { value: 'new', label: 'First-time only' },
  { value: 'returning', label: 'Returning only' },
];

// --------------------------------------------------------------- formatting

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export const fmtPct = (ratio: number, digits = 0): string =>
  `${(ratio * 100).toFixed(digits).replace(/\.0$/, '')}%`;

export const fmtNumber = (value: number): string =>
  Math.abs(value) >= 10000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value * 10) / 10);

export function fmtDelta(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { text: current === 0 ? 'no change' : 'new', direction: current > 0 ? 'up' : 'flat' };
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { text: 'flat', direction: 'flat' };
  return {
    text: `${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}%`,
    direction: change > 0 ? 'up' : 'down',
  };
}

export const fmtDateTime = (ms: number): string => {
  const d = new Date(ms);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
};

/** Country code → flag emoji + name, for a table that reads like a map. */
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

export function countryLabel(code: string | null): string {
  if (!code || code.length !== 2 || code === 'unknown') return 'Unknown';
  const flag = String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
  let name = code;
  try {
    name = REGION_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    name = code;
  }
  return `${flag} ${name}`;
}

export const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Phone',
  tablet: 'Tablet',
  desktop: 'Desktop',
  tv: 'TV / console',
  unknown: 'Unknown',
};
