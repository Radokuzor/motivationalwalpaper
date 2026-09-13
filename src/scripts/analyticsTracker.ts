/**
 * Visitor-session tracker -> POST /api/analytics/session-end (Telegram notifier).
 *
 * This site has no client-side router — every navigation is a full page load.
 * Session state (id, start time, referrer, page chain) is carried across those
 * loads in sessionStorage, keyed per tab. A same-origin link click closes out
 * the current page entry and flags the session as "continuing" *before* the
 * browser unloads, so the pagehide/visibilitychange handlers below only ever
 * beacon the session once — on whichever page load turns out to be the last
 * one (external nav, tab close, refresh without a tracked click).
 */

import { MW, on } from './events';

const SESSION_KEY = 'mw_analytics_session';
const NAV_CONTINUES_KEY = 'mw_analytics_nav_continues';
const PURCHASED_KEY = 'website_purchased';
const SKIP_PREFIXES = ['/admin', '/dashboard'];
const MAX_WALLPAPER_VIEWS = 100;

interface PageVisit {
  path: string;
  enteredAt: number;
  exitedAt: number | null;
  maxScrollPct: number;
}

/** One stretch of time a specific wallpaper (reel panel / category-grid tile)
 *  sat on screen — from `mw:reel-world` to the next one, or session end. */
interface WallpaperVisit {
  world: string;
  assetId: string | null;
  enteredAt: number;
  exitedAt: number | null;
}

interface SessionState {
  sessionId: string;
  startedAt: number;
  referrer: string | null;
  pages: PageVisit[];
  actions: string[];
  wallpaperViews?: WallpaperVisit[];
}

function shouldTrack(path: string): boolean {
  return !SKIP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function computeScrollPct(): number {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollableHeight <= 0) return 100;
  return Math.min(100, Math.round((window.scrollY / scrollableHeight) * 100));
}

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

function currentPage(state: SessionState): PageVisit | undefined {
  return state.pages[state.pages.length - 1];
}

function currentWallpaperView(state: SessionState): WallpaperVisit | undefined {
  const list = state.wallpaperViews;
  return list && list[list.length - 1];
}

/** Marks a successful purchase so the abandoned-checkout notification is skipped. */
export function markPurchased(): void {
  try {
    sessionStorage.setItem(PURCHASED_KEY, '1');
  } catch {
    // best-effort
  }
}

/** Records a notable on-site action (download, quiz completed, contact submitted, article read) for the session summary. */
export function trackAction(label: string): void {
  const state = loadState();
  if (!state) return;
  if (!state.actions) state.actions = [];
  if (!state.actions.includes(label)) state.actions.push(label);
  saveState(state);
}

export function initAnalyticsTracker(): void {
  const path = window.location.pathname;
  if (!shouldTrack(path)) return;

  try {
    sessionStorage.removeItem(NAV_CONTINUES_KEY);
  } catch {
    // ignore
  }

  let state = loadState();
  if (!state) {
    state = {
      sessionId: randomId(),
      startedAt: Date.now(),
      referrer: document.referrer || null,
      pages: [],
      actions: [],
    };
  } else {
    const last = currentPage(state);
    if (last && last.exitedAt === null) last.exitedAt = Date.now();
  }

  state.pages.push({ path, enteredAt: Date.now(), exitedAt: null, maxScrollPct: 0 });
  saveState(state);

  let sent = false;
  let scrollScheduled = false;

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
    });
  }

  function onDocumentClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as Element | null)?.closest?.('a[href]');
    if (!anchor) return;
    const target = anchor.getAttribute('target');
    if (target && target !== '_self') return;
    if (anchor.hasAttribute('download')) return;

    let url: URL;
    try {
      url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname) return;

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

    const current = loadState();
    if (!current) return;
    const now = Date.now();
    const last = currentPage(current);
    if (last && last.exitedAt === null) {
      last.exitedAt = now;
      last.maxScrollPct = Math.max(last.maxScrollPct, computeScrollPct());
    }
    const lastWallpaper = currentWallpaperView(current);
    if (lastWallpaper && lastWallpaper.exitedAt === null) lastWallpaper.exitedAt = now;

    const payload = {
      sessionId: current.sessionId,
      pages: current.pages,
      startedAt: current.startedAt,
      endedAt: now,
      referrer: current.referrer,
      purchased: sessionStorage.getItem(PURCHASED_KEY) === '1',
      actions: current.actions ?? [],
      // Collapse to {world, assetId, dwellMs} — the server only aggregates,
      // raw enter/exit timestamps would just be dead weight in the payload.
      wallpaperViews: (current.wallpaperViews ?? []).map((w) => ({
        world: w.world,
        assetId: w.assetId,
        dwellMs: Math.max(0, (w.exitedAt ?? now) - w.enteredAt),
      })),
    };

    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/session-end', blob);
    } catch {
      // sendBeacon is best-effort; a failure here is not recoverable.
    }
  }

  // Tracks which wallpaper (reel panel / category-grid tile) is on screen,
  // for "most viewed" / "time spent" stats — fires on every real change of
  // the on-screen wallpaper (Reel.astro de-dupes re-announcing the same one,
  // except when the CTA re-announces the current panel before opening the
  // capture sheet, which the guard below skips so a click doesn't fragment
  // an otherwise-continuous dwell into a fresh near-zero entry).
  on(MW.reelWorld, (d) => {
    const state = loadState();
    if (!state) return;
    if (!state.wallpaperViews) state.wallpaperViews = [];
    const assetId = d.asset?.id ?? null;
    const last = currentWallpaperView(state);
    if (last && last.exitedAt === null && last.world === d.world && last.assetId === assetId) return;
    const now = Date.now();
    if (last && last.exitedAt === null) last.exitedAt = now;
    if (state.wallpaperViews.length < MAX_WALLPAPER_VIEWS) {
      state.wallpaperViews.push({ world: d.world, assetId, enteredAt: now, exitedAt: null });
    }
    saveState(state);
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onDocumentClick, { capture: true });
  window.addEventListener('pagehide', sendSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendSession();
  });
}
