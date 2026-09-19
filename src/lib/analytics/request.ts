/**
 * Server-side request enrichment — geography and a privacy-safe visitor hash.
 *
 * Geography comes free from the edge: Vercel stamps `x-vercel-ip-*` headers on
 * every request that reaches a function, so there is no GeoIP database to ship
 * or license. Cloudflare's `cf-ipcountry` is read too, so the numbers survive a
 * move behind another proxy.
 *
 * The raw IP is never stored. It's salted (ANALYTICS_SALT) and hashed together
 * with the user-agent and the UTC date, giving a per-day pseudonymous id: good
 * enough to count "unique visitors today" and to spot one IP opening forty
 * sessions, useless for identifying a person and self-expiring every midnight.
 */
import { createHash } from 'node:crypto';

const env = { ...process.env, ...import.meta.env } as Record<string, string | undefined>;

export interface GeoInfo {
  country: string | null; // ISO-3166 alpha-2, e.g. "US"
  region: string | null; // e.g. "CA"
  city: string | null; // e.g. "San Francisco"
  latitude: number | null;
  longitude: number | null;
  /** IANA timezone the edge believes the IP is in, e.g. "America/Chicago". */
  ipTimezone: string | null;
}

const decode = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 80) || null;
  } catch {
    return value.slice(0, 80) || null;
  }
};

const num = (value: string | null): number | null => {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function readGeo(request: Request): GeoInfo {
  const h = request.headers;
  const country = (h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? '').toUpperCase() || null;
  return {
    country: country && country !== 'XX' ? country.slice(0, 2) : null,
    region: decode(h.get('x-vercel-ip-country-region')),
    city: decode(h.get('x-vercel-ip-city')),
    latitude: num(h.get('x-vercel-ip-latitude')),
    longitude: num(h.get('x-vercel-ip-longitude')),
    ipTimezone: decode(h.get('x-vercel-ip-timezone')),
  };
}

/** First hop in x-forwarded-for — the client, before the proxies. */
export function clientIp(request: Request): string | null {
  const h = request.headers;
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? null;
}

/**
 * Rotating pseudonymous visitor id — hash(salt + ip + user-agent + UTC day).
 * Same person, same day, same device => same hash. Tomorrow => a new one.
 * Not reversible to an IP; nothing here is stored alongside the raw address.
 */
export function visitorHash(request: Request, dayKey: string): string {
  const salt = env.ANALYTICS_SALT ?? env.FIREBASE_PROJECT_ID ?? 'mw-analytics';
  const ip = clientIp(request) ?? 'noip';
  const ua = request.headers.get('user-agent') ?? 'noua';
  return createHash('sha256').update(`${salt}|${ip}|${ua}|${dayKey}`).digest('hex').slice(0, 24);
}

/** UTC date key, "YYYY-MM-DD" — the bucket every rollup is filed under. */
export function dayKey(at: number | Date = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * TLS/HTTP fingerprint digest Vercel adds on supported plans. Present or not,
 * it costs nothing to record: two "different" browsers sharing one digest is a
 * strong scripted-traffic tell.
 */
export function fingerprint(request: Request): string | null {
  const h = request.headers;
  return h.get('x-vercel-ja4-digest') ?? h.get('x-vercel-ja3-digest') ?? null;
}
