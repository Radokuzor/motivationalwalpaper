/**
 * POST /api/analytics/session-end — the visitor session, closed out.
 *
 * Fired once per browser session by the client tracker
 * (src/scripts/analyticsTracker.ts) via navigator.sendBeacon, right as the
 * visitor leaves. The page chain, scroll depth, interaction counters, tracked
 * actions and which wallpapers were on screen all arrive in one payload.
 *
 * Storage lives in src/lib/analytics/session.ts — this route is the HTTP shell
 * plus the Telegram notification. Two rules the notification follows:
 *   - Bots never generate a message. A crawler tripping the phone at 3am was
 *     the single biggest source of noise in the old version.
 *   - Bounces stay silent too, but they are still *counted* — a three-second
 *     visit is real traffic data even when it isn't worth a notification.
 */
import type { APIRoute } from 'astro';
import { parseSessionEnd, recordSessionEnd, serverContext } from '../../../lib/analytics/session';
import { CHANNEL_LABELS } from '../../../lib/analytics/sources';
import { notifyTelegram, escapeMarkdown } from '../../../lib/telegram';

export const prerender = false;

const SITE_NAME = 'motivationalwallpaper.com';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function durationText(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }

  const payload = parseSessionEnd(body);
  if (!payload) return json({ ok: true });

  const ctx = serverContext(request);
  let result;
  try {
    result = await recordSessionEnd(payload, ctx);
  } catch (err) {
    console.error('session-end analytics write failed', err);
    return json({ ok: false }, 200);
  }

  if (result.quality === 'bot' || result.isBounce) return json({ ok: true });

  const reachedCheckout = payload.pages.some((page) => page.path === '/checkout');
  const abandonedCheckout = reachedCheckout && !payload.purchased;
  const place = [result.geo.city, result.geo.region, result.geo.country].filter(Boolean).join(', ');
  const device = `${result.device.deviceType} · ${result.device.os} · ${result.device.browser}`;

  const lines = [
    `🌐 *${SITE_NAME}*`,
    abandonedCheckout ? '⚠️ *Checkout abandoned*' : '👀 *Visitor session*',
    `From: ${escapeMarkdown(CHANNEL_LABELS[result.acquisition.channel])} — ${escapeMarkdown(result.acquisition.source)}`,
    place ? `Location: ${escapeMarkdown(place)}` : 'Location: unknown',
    `Device: ${escapeMarkdown(device)}`,
    `Duration: ${durationText(result.durationMs)}`,
    `Pages (${result.pageCount}): ${payload.pages.map((p) => escapeMarkdown(p.path)).join(' → ')}`,
    `Max scroll: ${result.maxScrollPct}%`,
  ];
  if (result.quality === 'suspect') {
    lines.push('🤖 _Flagged as possibly automated_');
  }
  if (payload.actions.length > 0) {
    lines.push(`Actions: ${payload.actions.map(escapeMarkdown).join(', ')}`);
  }
  if (payload.referrer) {
    lines.push(`Referrer: ${escapeMarkdown(payload.referrer)}`);
  }

  await notifyTelegram(lines.join('\n'));

  return json({ ok: true });
};
