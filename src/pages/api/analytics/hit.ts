/**
 * POST /api/analytics/hit — one page view, recorded the moment it happens.
 *
 * The companion to /api/analytics/session-end: that one fires on the way out
 * and carries behaviour, this one fires on the way in and carries identity
 * (device, locale, campaign tags) plus the server's own view of the request
 * (geo from the Vercel edge headers, user-agent, bot verdict).
 *
 * Why both: an unload beacon is best-effort, and mobile Safari in particular
 * kills tabs without ever running one. Counting the view here means traffic
 * numbers hold up even when the exit beacon never arrives — the exit beacon
 * then only adds duration, scroll depth and actions on top.
 *
 * Public and unauthenticated, so every field is validated and capped in
 * src/lib/analytics/session.ts before it reaches Firestore.
 */
import type { APIRoute } from 'astro';
import { parseHit, recordHit, serverContext } from '../../../lib/analytics/session';

export const prerender = false;

const ok = () => new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const hit = parseHit(body);
  if (!hit) return new Response(null, { status: 400 });

  try {
    await recordHit(hit, serverContext(request));
  } catch (err) {
    // Analytics never breaks a page load: log and swallow.
    console.error('analytics hit failed', err);
  }
  return ok();
};
