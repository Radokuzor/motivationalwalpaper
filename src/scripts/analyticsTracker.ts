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

const SESSION_KEY = 'mw_analytics_session';
const NAV_CONTINUES_KEY = 'mw_analytics_nav_continues';
const PURCHASED_KEY = 'website_purchased';
const SKIP_PREFIXES = ['/admin', '/dashboard'];

interface PageVisit {
  path: string;
  enteredAt: number;
  exitedAt: number | null;
  maxScrollPct: number;
}

interface SessionState {
  sessionId: string;
  startedAt: number;
  referrer: string | null;
  pages: PageVisit[];
  actions: string[];
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
    const last = currentPage(current);
    if (last && last.exitedAt === null) {
      last.exitedAt = Date.now();
      last.maxScrollPct = Math.max(last.maxScrollPct, computeScrollPct());
    }

    const payload = {
      sessionId: current.sessionId,
      pages: current.pages,
      startedAt: current.startedAt,
      endedAt: Date.now(),
      referrer: current.referrer,
      purchased: sessionStorage.getItem(PURCHASED_KEY) === '1',
      actions: current.actions ?? [],
    };

    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/session-end', blob);
    } catch {
      // sendBeacon is best-effort; a failure here is not recoverable.
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onDocumentClick, { capture: true });
  window.addEventListener('pagehide', sendSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendSession();
  });
}
