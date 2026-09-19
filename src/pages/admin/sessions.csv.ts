/**
 * GET /admin/sessions.csv — the current dashboard selection, as raw rows.
 *
 * Takes exactly the same query params as /admin/traffic and /admin/audience, so
 * "export what I am looking at" is a link, not a second filtering UI. One row
 * per session with every stored dimension — for the questions a fixed dashboard
 * will never answer.
 */
import type { APIRoute } from 'astro';
import { requireBasicAuth } from '../../lib/adminAuth';
import { fetchSessions, applyFilters, sessionsToCsv } from '../../lib/analytics/query';
import { parseRange, parseFilters } from '../../lib/analytics/dashboard';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const denied = requireBasicAuth(request);
  if (denied) return denied;

  try {
    const range = parseRange(url.searchParams);
    const filters = parseFilters(url.searchParams);
    const sessions = await fetchSessions({ fromMs: range.fromMs, toMs: range.toMs });
    const rows = applyFilters(sessions, filters);
    return new Response(sessionsToCsv(rows), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="sessions_${range.fromDay}_to_${range.toDay}.csv"`,
      },
    });
  } catch (err) {
    console.error('session csv export failed', err);
    return new Response('Internal error', { status: 500 });
  }
};
