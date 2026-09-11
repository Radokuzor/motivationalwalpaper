/**
 * POST /api/analytics/session-end — visitor-session summary -> Telegram.
 *
 * Fired once per browser session by the client tracker (src/scripts/analyticsTracker.ts)
 * via navigator.sendBeacon, right as the visitor leaves. Stateless: no session is
 * persisted here, the whole page chain arrives in one payload and is either
 * relayed to Telegram (src/lib/telegram.ts) or dropped (bounce / bad payload).
 */
import type { APIRoute } from 'astro';
import { notifyTelegram } from '../../../lib/telegram';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

interface PageVisit {
  path: string;
  enteredAt: number;
  exitedAt: number | null;
  maxScrollPct: number;
}

const SITE_NAME = 'motivationalwallpaper.com';
const BOUNCE_DURATION_MS = 3000;
const BOUNCE_MAX_SCROLL_PCT = 10;
const MAX_ACTIONS = 20;

/** Escape Telegram legacy-Markdown special characters in untrusted text. */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, '\\$1');
}

function isPageVisit(value: unknown): value is PageVisit {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.path === 'string' &&
    typeof p.enteredAt === 'number' &&
    (p.exitedAt === null || typeof p.exitedAt === 'number') &&
    typeof p.maxScrollPct === 'number'
  );
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ ok: false }, 400);
  }

  const pages = Array.isArray(body.pages) ? body.pages.filter(isPageVisit) : [];
  const startedAt = typeof body.startedAt === 'number' ? body.startedAt : null;
  const endedAt = typeof body.endedAt === 'number' ? body.endedAt : null;
  const referrer = typeof body.referrer === 'string' && body.referrer ? body.referrer : null;
  const purchased = body.purchased === true;
  const actions = Array.isArray(body.actions)
    ? body.actions.filter((a): a is string => typeof a === 'string' && a.length > 0).slice(0, MAX_ACTIONS)
    : [];

  if (pages.length === 0) return json({ ok: true });
  if (startedAt === null || endedAt === null) return json({ ok: true });

  const durationMs = Math.max(0, endedAt - startedAt);
  const maxScrollPct = Math.max(0, ...pages.map((p) => p.maxScrollPct));
  const reachedCheckout = pages.some((page) => page.path === '/checkout');
  const abandonedCheckout = reachedCheckout && purchased !== true;

  // Ignore very short bounces.
  const isBounce =
    durationMs < BOUNCE_DURATION_MS || pages.length <= 1 || maxScrollPct < BOUNCE_MAX_SCROLL_PCT;
  if (isBounce) return json({ ok: true });

  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  const pathChain = pages.map((page) => escapeMarkdown(page.path)).join(' → ');

  const lines = [
    `🌐 *${SITE_NAME}*`,
    abandonedCheckout ? '⚠️ *Checkout abandoned*' : '👀 *Visitor session*',
    `Duration: ${durationText}`,
    `Pages (${pages.length}): ${pathChain}`,
    `Max scroll: ${maxScrollPct}%`,
  ];
  if (actions.length > 0) {
    lines.push(`Actions: ${actions.map(escapeMarkdown).join(', ')}`);
  }
  if (referrer) {
    lines.push(`Referrer: ${escapeMarkdown(referrer)}`);
  }

  await notifyTelegram(lines.join('\n'));

  return json({ ok: true });
};
