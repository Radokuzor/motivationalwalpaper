/**
 * Visitor tracker — the browser half of the analytics system.
 *
 * This site has no client-side router, so every navigation is a full page load.
 * Session state (id, start time, referrer, campaign tags, the page chain, the
 * interaction counters) is carried across those loads in sessionStorage, keyed
 * per tab. Visitor identity — the one thing that must outlive the tab — lives
 * in localStorage, which is what makes "new vs returning" answerable.
 *
 * Two beacons go out:
 *   /api/analytics/hit          once per page load, immediately.
 *   /api/analytics/session-end  once per session, on the way out.
 * A same-origin link click closes out the current page entry and flags the
 * session as "continuing" *before* the browser unloads, so the pagehide /
 * visibilitychange handlers only ever beacon the session once — on whichever
 * page load turns out to be the last (external nav, tab close, refresh).
 *
 * Nothing collected here identifies a person: no cookies, no cross-site ids,
 * no IP stored server-side (it's salted, hashed and rotated daily). Everything
 * is either a device capability the browser volunteers to any script, or
 * something the visitor did on this site.
 */

import { MW, on } from './events';
import type {
  ClientAcquisition,
  ClientEnvironment,
  EngagementPayload,
  PageVisitPayload,
} from '../lib/analytics/payload';

const SESSION_KEY = 'mw_analytics_session';
const VISITOR_KEY = 'mw_visitor';
const NAV_CONTINUES_KEY = 'mw_analytics_nav_continues';
const PURCHASED_KEY = 'website_purchased';
const SKIP_PREFIXES = ['/admin', '/dashboard'];
const MAX_WALLPAPER_VIEWS = 100;
const MAX_PAGES = 40;
const MAX_OUTBOUND = 20;

interface WallpaperVisit {
  world: string;
  assetId: string | null;
  enteredAt: number;
  exitedAt: number | null;
}

interface SessionState {
  sessionId: string;
  visitorId: string;
  isNewVisitor: boolean;
  visitCount: number;
  startedAt: number;
  referrer: string | null;
  acquisition: ClientAcquisition;
  pages: PageVisitPayload[];
  actions: string[];
  engagement: EngagementPayload;
  wallpaperViews?: WallpaperVisit[];
}

interface VisitorRecord {
  id: string;
  firstSeenAt: number;
  visits: number;
}

function shouldTrack(path: string): boolean {
  return !SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ------------------------------------------------------------------ identity

/**
 * A first-party, per-browser id in localStorage — the only way to tell a first
 * visit from a fifth one. Not a cookie, never sent anywhere but this site, and
 * gone the moment the visitor clears site data.
 */
function loadVisitor(): { record: VisitorRecord; isNew: boolean } {
  const fresh: VisitorRecord = { id: randomId(), firstSeenAt: Date.now(), visits: 0 };
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    if (!raw) return { record: fresh, isNew: true };
    const parsed = JSON.parse(raw) as Partial<VisitorRecord>;
    if (!parsed || typeof parsed.id !== 'string') return { record: fresh, isNew: true };
    return {
      record: {
        id: parsed.id,
        firstSeenAt: typeof parsed.firstSeenAt === 'number' ? parsed.firstSeenAt : Date.now(),
        visits: typeof parsed.visits === 'number' ? parsed.visits : 0,
      },
      isNew: false,
    };
  } catch {
    return { record: fresh, isNew: true };
  }
}

function saveVisitor(record: VisitorRecord): void {
  try {
    localStorage.setItem(VISITOR_KEY, JSON.stringify(record));
  } catch {
    // Private mode / blocked storage — every visit then looks like a first visit.
  }
}

// --------------------------------------------------------------- environment

/** Everything the browser will tell us about itself, read once, synchronously. */
function readEnvironment(): ClientEnvironment {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
    userAgentData?: { platform?: string; mobile?: boolean; brands?: Array<{ brand: string; version: string }> };
  };
  const conn = nav.connection;
  const uaData = nav.userAgentData;

  const media = (query: string): boolean | null => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return null;
    }
  };

  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = null;
  }

  // Navigation Timing — how fast the page actually felt, per real visitor.
  let ttfbMs: number | null = null;
  let loadMs: number | null = null;
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entry) {
      ttfbMs = Math.round(entry.responseStart);
      loadMs = entry.domContentLoadedEventEnd > 0 ? Math.round(entry.domContentLoadedEventEnd) : null;
    }
  } catch {
    // Not supported — page-speed fields just stay null.
  }

  return {
    screenW: window.screen?.width ?? 0,
    screenH: window.screen?.height ?? 0,
    viewportW: window.innerWidth ?? 0,
    viewportH: window.innerHeight ?? 0,
    dpr: window.devicePixelRatio ?? 1,
    orientation: (window.innerHeight ?? 0) >= (window.innerWidth ?? 0) ? 'portrait' : 'landscape',
    touch: 'ontouchstart' in window || (nav.maxTouchPoints ?? 0) > 0,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    language: nav.language ?? null,
    languageCount: Array.isArray(nav.languages) ? nav.languages.length : 0,
    timezone,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    connection: conn?.effectiveType ?? null,
    saveData: typeof conn?.saveData === 'boolean' ? conn.saveData : null,
    colorScheme: media('(prefers-color-scheme: dark)') ? 'dark' : 'light',
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    uaPlatform: uaData?.platform ?? null,
    uaMobile: typeof uaData?.mobile === 'boolean' ? uaData.mobile : null,
    uaBrands: uaData?.brands?.map((b) => `${b.brand} ${b.version}`).join(', ') ?? null,
    webdriver: nav.webdriver === true,
    cookieEnabled: nav.cookieEnabled !== false,
    // Read off a widened type on purpose: `navigator.plugins` is deprecated in
    // the DOM lib, but an empty plugin list on desktop Chrome is still one of
    // the cheapest headless tells there is.
    pluginCount: (navigator as unknown as { plugins?: { length?: number } }).plugins?.length ?? 0,
    ttfbMs,
    loadMs,
  };
}

const CLICK_ID_KEYS = ['gclid', 'msclkid', 'fbclid', 'ttclid', 'twclid', 'li_fat_id'];

/** Campaign tags off the landing URL — captured once, kept for the session. */
function readAcquisition(): ClientAcquisition {
  const params = new URLSearchParams(window.location.search);
  const get = (key: string) => {
    const value = params.get(key);
    return value ? value.slice(0, 120) : null;
  };
  const clickIds: Record<string, string> = {};
  for (const key of CLICK_ID_KEYS) {
    const value = get(key);
    if (value) clickIds[key] = value;
  }
  return {
    utmSource: get('utm_source'),
    utmMedium: get('utm_medium'),
    utmCampaign: get('utm_campaign'),
    utmTerm: get('utm_term'),
    utmContent: get('utm_content'),
    clickIds,
    refTag: get('ref') ?? get('via') ?? get('source'),
  };
}

// ------------------------------------------------------------------- storage

function loadState(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionState) : null;
  } catch {
    return null;
  }
}

function saveState(state: SessionState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (private mode, quota) — tracking degrades silently.
  }
}

function currentPage(state: SessionState): PageVisitPayload | undefined {
  return state.pages[state.pages.length - 1];
}

function currentWallpaperView(state: SessionState): WallpaperVisit | undefined {
  const list = state.wallpaperViews;
  return list && list[list.length - 1];
}

function computeScrollPct(): number {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollableHeight <= 0) return 100;
  return Math.min(100, Math.round((window.scrollY / scrollableHeight) * 100));
}

function beacon(url: string, payload: unknown): void {
  try {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon?.(url, blob)) return;
    // sendBeacon refused (payload too large, or unsupported) — keepalive fetch.
    void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } });
  } catch {
    // Best-effort by design: analytics never interferes with the page.
  }
}

// ------------------------------------------------------------- public helpers

/** Marks a successful purchase so the abandoned-checkout notification is skipped. */
export function markPurchased(): void {
  try {
    sessionStorage.setItem(PURCHASED_KEY, '1');
  } catch {
    // best-effort
  }
}

/** Records a notable on-site action (download, quiz completed, contact submitted) for the session summary. */
export function trackAction(label: string): void {
  const state = loadState();
  if (!state) return;
  if (!state.actions) state.actions = [];
  if (!state.actions.includes(label)) state.actions.push(label);
  saveState(state);
}

// ----------------------------------------------------------------- the entry

export function initAnalyticsTracker(): void {
  const path = window.location.pathname;
  if (!shouldTrack(path)) return;

  try {
    sessionStorage.removeItem(NAV_CONTINUES_KEY);
  } catch {
    // ignore
  }

  const env = readEnvironment();
  const now = Date.now();
  let state = loadState();
  let isFirstHit = false;

  if (!state) {
    isFirstHit = true;
    const { record, isNew } = loadVisitor();
    record.visits += 1;
    saveVisitor(record);
    state = {
      sessionId: randomId(),
      visitorId: record.id,
      isNewVisitor: isNew || record.visits <= 1,
      visitCount: record.visits,
      startedAt: now,
      referrer: document.referrer || null,
      acquisition: readAcquisition(),
      pages: [],
      actions: [],
      engagement: { clicks: 0, keypresses: 0, pointerMoves: 0, scrollEvents: 0, activeMs: 0, outbound: [] },
    };
  } else {
    const last = currentPage(state);
    if (last && last.exitedAt === null) last.exitedAt = now;
    if (!state.engagement) {
      state.engagement = { clicks: 0, keypresses: 0, pointerMoves: 0, scrollEvents: 0, activeMs: 0, outbound: [] };
    }
  }

  const title = document.title ? document.title.slice(0, 120) : null;
  if (state.pages.length < MAX_PAGES) {
    state.pages.push({ path, title, enteredAt: now, exitedAt: null, maxScrollPct: 0, activeMs: 0 });
  }
  saveState(state);

  const pageIndex = state.pages.length;

  beacon('/api/analytics/hit', {
    sessionId: state.sessionId,
    visitorId: state.visitorId,
    isFirstHit,
    isNewVisitor: state.isNewVisitor,
    visitCount: state.visitCount,
    startedAt: state.startedAt,
    path,
    title,
    referrer: state.referrer,
    pageIndex,
    env,
    acquisition: state.acquisition,
  });

  let sent = false;
  let scrollScheduled = false;
  // Active time = time this page was actually visible. Accumulated in chunks so
  // a backgrounded tab left open overnight doesn't read as an hours-long read.
  let activeSince = document.visibilityState === 'visible' ? Date.now() : null;

  function flushActiveTime(): void {
    if (activeSince === null) return;
    const elapsed = Date.now() - activeSince;
    activeSince = null;
    if (elapsed <= 0) return;
    const current = loadState();
    const last = current && currentPage(current);
    if (!current || !last) return;
    last.activeMs = (last.activeMs ?? 0) + elapsed;
    current.engagement.activeMs += elapsed;
    saveState(current);
  }

  function bumpEngagement(field: 'clicks' | 'keypresses' | 'pointerMoves' | 'scrollEvents'): void {
    const current = loadState();
    if (!current) return;
    current.engagement[field] += 1;
    saveState(current);
  }

  function updateScroll(): void {
    const current = loadState();
    const last = current && currentPage(current);
    if (!current || !last) return;
    const pct = computeScrollPct();
    if (pct > last.maxScrollPct) {
      last.maxScrollPct = pct;
      saveState(current);
    }
  }

  function onScroll(): void {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      scrollScheduled = false;
      updateScroll();
      bumpEngagement('scrollEvents');
    });
  }

  function onDocumentClick(e: MouseEvent): void {
    bumpEngagement('clicks');
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as Element | null)?.closest?.('a[href]');
    if (!anchor) return;

    let url: URL;
    try {
      url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
    } catch {
      return;
    }

    // Outbound click — record where people leave to, then let it happen.
    if (url.origin !== window.location.origin) {
      const current = loadState();
      if (current && current.engagement.outbound.length < MAX_OUTBOUND && !current.engagement.outbound.includes(url.hostname)) {
        current.engagement.outbound.push(url.hostname);
        saveState(current);
      }
      return;
    }

    const target = anchor.getAttribute('target');
    if (target && target !== '_self') return;
    if (anchor.hasAttribute('download')) return;
    if (url.pathname === window.location.pathname) return;

    flushActiveTime();
    const current = loadState();
    const last = current && currentPage(current);
    if (current && last && last.exitedAt === null) {
      last.exitedAt = Date.now();
      last.maxScrollPct = Math.max(last.maxScrollPct, computeScrollPct());
      saveState(current);
    }
    try {
      sessionStorage.setItem(NAV_CONTINUES_KEY, '1');
    } catch {
      // ignore
    }
  }

  function sendSession(): void {
    if (sent) return;
    if (sessionStorage.getItem(NAV_CONTINUES_KEY) === '1') return;
    sent = true;

    flushActiveTime();
    const current = loadState();
    if (!current) return;
    const at = Date.now();
    const last = currentPage(current);
    if (last && last.exitedAt === null) {
      last.exitedAt = at;
      last.maxScrollPct = Math.max(last.maxScrollPct, computeScrollPct());
    }
    const lastWallpaper = currentWallpaperView(current);
    if (lastWallpaper && lastWallpaper.exitedAt === null) lastWallpaper.exitedAt = at;

    beacon('/api/analytics/session-end', {
      sessionId: current.sessionId,
      visitorId: current.visitorId,
      startedAt: current.startedAt,
      endedAt: at,
      referrer: current.referrer,
      purchased: sessionStorage.getItem(PURCHASED_KEY) === '1',
      actions: current.actions ?? [],
      pages: current.pages,
      engagement: current.engagement,
      env,
      acquisition: current.acquisition,
      // Collapse to {world, assetId, dwellMs} — the server only aggregates,
      // raw enter/exit timestamps would just be dead weight in the payload.
      wallpaperViews: (current.wallpaperViews ?? []).map((w) => ({
        world: w.world,
        assetId: w.assetId,
        dwellMs: Math.max(0, (w.exitedAt ?? at) - w.enteredAt),
      })),
    });
  }

  // Tracks which wallpaper (reel panel / category-grid tile) is on screen,
  // for "most viewed" / "time spent" stats — fires on every real change of
  // the on-screen wallpaper (Reel.astro de-dupes re-announcing the same one,
  // except when the CTA re-announces the current panel before opening the
  // capture sheet, which the guard below skips so a click doesn't fragment
  // an otherwise-continuous dwell into a fresh near-zero entry).
  on(MW.reelWorld, (d) => {
    const current = loadState();
    if (!current) return;
    if (!current.wallpaperViews) current.wallpaperViews = [];
    const assetId = d.asset?.id ?? null;
    const last = currentWallpaperView(current);
    if (last && last.exitedAt === null && last.world === d.world && last.assetId === assetId) return;
    const at = Date.now();
    if (last && last.exitedAt === null) last.exitedAt = at;
    if (current.wallpaperViews.length < MAX_WALLPAPER_VIEWS) {
      current.wallpaperViews.push({ world: d.world, assetId, enteredAt: at, exitedAt: null });
    }
    saveState(current);
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onDocumentClick, { capture: true });
  document.addEventListener('keydown', () => bumpEngagement('keypresses'), { passive: true });
  // Pointer movement is sampled, not counted per event: the question it answers
  // is "was a human hand ever on this", and 60 events a second would flood
  // sessionStorage for no extra information.
  let lastPointerSample = 0;
  document.addEventListener(
    'pointermove',
    () => {
      const at = Date.now();
      if (at - lastPointerSample < 1000) return;
      lastPointerSample = at;
      bumpEngagement('pointerMoves');
    },
    { passive: true },
  );

  window.addEventListener('pagehide', sendSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushActiveTime();
      sendSession();
    } else {
      activeSince = Date.now();
    }
  });
}
