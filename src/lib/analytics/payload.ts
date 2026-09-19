/**
 * The wire contract between the browser tracker and /api/analytics/*.
 *
 * Types only, no runtime dependencies — imported by both the client bundle
 * (src/scripts/analyticsTracker.ts) and the server routes, so the two can never
 * drift apart silently. Every field is optional on the server side anyway: the
 * routes re-validate whatever actually arrives (see validate.ts) because this
 * endpoint is public and unauthenticated.
 */

/** Everything the browser can tell us about itself in one cheap synchronous read. */
export interface ClientEnvironment {
  /** Screen and layout — the real answer to "what are people viewing this on". */
  screenW: number;
  screenH: number;
  viewportW: number;
  viewportH: number;
  dpr: number;
  orientation: 'portrait' | 'landscape' | null;
  touch: boolean;
  maxTouchPoints: number;
  /** Locale + clock — a decent proxy for where someone is, IP geo aside. */
  language: string | null;
  languageCount: number;
  timezone: string | null;
  /** Hardware hints, where the browser exposes them. */
  cores: number | null;
  memoryGb: number | null;
  /** Network Information API — '4g' | '3g' | 'slow-2g' | null. */
  connection: string | null;
  saveData: boolean | null;
  /** Rendering preferences — tells you how many people browse in dark mode. */
  colorScheme: 'dark' | 'light' | null;
  reducedMotion: boolean | null;
  /** User-Agent Client Hints (Chromium only), null elsewhere. */
  uaPlatform: string | null;
  uaMobile: boolean | null;
  uaBrands: string | null;
  /** Automation / headless tells. */
  webdriver: boolean;
  cookieEnabled: boolean;
  pluginCount: number;
  /** Navigation Timing, rounded to ms — page speed as visitors actually felt it. */
  ttfbMs: number | null;
  loadMs: number | null;
}

/** Campaign tagging lifted off the landing URL. */
export interface ClientAcquisition {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  /** Ad-platform click ids: gclid, msclkid, fbclid, ttclid, twclid, li_fat_id. */
  clickIds: Record<string, string>;
  /** Short `?ref=` / `?via=` tag, for partner links that carry no UTM set. */
  refTag: string | null;
}

/** Per-page behaviour, one entry per page load in the session. */
export interface PageVisitPayload {
  path: string;
  /** Page title, trimmed — makes the blog rows readable in the dashboard. */
  title?: string | null;
  enteredAt: number;
  exitedAt: number | null;
  maxScrollPct: number;
  /** Time the tab was actually visible on this page. */
  activeMs?: number;
}

/** Aggregate interaction counters for the whole session. */
export interface EngagementPayload {
  clicks: number;
  keypresses: number;
  pointerMoves: number;
  scrollEvents: number;
  /** Total visible-and-focused time across all pages. */
  activeMs: number;
  /** Outbound links clicked, host only. */
  outbound: string[];
}

/** One stretch of time a wallpaper sat on screen, collapsed for the wire. */
export interface WallpaperViewPayload {
  world: string;
  assetId: string | null;
  dwellMs: number;
}

/** POST /api/analytics/hit — fired once per page load, as early as possible. */
export interface HitPayload {
  sessionId: string;
  visitorId: string;
  /** True on the first page load of a session (drives the session counter). */
  isFirstHit: boolean;
  /** True when this browser has no prior visit recorded in localStorage. */
  isNewVisitor: boolean;
  /** How many sessions this browser has started, including this one. */
  visitCount: number;
  startedAt: number;
  path: string;
  title: string | null;
  referrer: string | null;
  /** Page number within the session, 1-based. */
  pageIndex: number;
  env: ClientEnvironment;
  acquisition: ClientAcquisition;
}

/** POST /api/analytics/session-end — the full picture, beaconed on the way out. */
export interface SessionEndPayload {
  sessionId: string;
  visitorId: string;
  startedAt: number;
  endedAt: number;
  referrer: string | null;
  purchased: boolean;
  actions: string[];
  pages: PageVisitPayload[];
  engagement: EngagementPayload;
  wallpaperViews: WallpaperViewPayload[];
  env: ClientEnvironment;
  acquisition: ClientAcquisition;
}

export const ANALYTICS_LIMITS = {
  MAX_PAGES: 40,
  MAX_ACTIONS: 20,
  MAX_WALLPAPER_VIEWS: 100,
  MAX_OUTBOUND: 20,
  /** A day — anything past this is a broken clock, not real dwell. */
  MAX_DWELL_MS: 24 * 60 * 60 * 1000,
} as const;
