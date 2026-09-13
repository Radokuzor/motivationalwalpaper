import type { APIRoute } from 'astro';
import { requireBasicAuth } from '../../lib/adminAuth';
import { fetchSurveyResponses, rowsToCsv } from '../../lib/adminData';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const denied = requireBasicAuth(request);
  if (denied) return denied;

  try {
    const rows = await fetchSurveyResponses({
      status: url.searchParams.get('status') ?? undefined,
      profile: url.searchParams.get('profile') ?? undefined,
    });
    return new Response(rowsToCsv(rows), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="survey_responses.csv"',
      },
    });
  } catch (err) {
    console.error('admin csv export failed', err);
    return new Response('Internal error', { status: 500 });
  }
};
