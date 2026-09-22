/**
 * POST /api/survey — survey capture (progressive).
 *
 * Called repeatedly by the Screen One flow, fire-and-forget:
 *   - once when contact is submitted (capture), then
 *   - after each quiz step, then
 *   - once more at completion.
 * Every call sends the full current state plus a client-generated `responseId`
 * and a `status` (`partial` while in progress, `complete` at the end). The route
 * upserts one Firestore doc per `responseId` so an abandoned flow still leaves a
 * row (with whatever was answered) instead of nothing.
 *
 * This route:
 *   1. parses JSON        → 400 on bad JSON
 *   2. checks the honeypot → 200 {ok:true}, writes nothing, if `company` is set
 *   3. validates whatever fields are present against the sets derived from STEPS
 *      (a `complete` call must have them all; a `partial` call need not)
 *   4. recomputes `profile` server-side once routable (any client `profile` is
 *      ignored)
 *   5. stamps device (UA-parsed browser/OS/device type) and location
 *      (edge-header geo — country/region/city, no IP stored) onto the row
 *   6. upserts the row in Firestore `survey_responses` via the Admin SDK
 *
 * Channel tools (Beehiiv / SMS) are deferred: a present contact is stamped
 * `pending` so a later migration can pick it up. Nothing is sent here.
 *
 * Follow-up: no rate limiting / CAPTCHA beyond the honeypot yet.
 */
import type { APIRoute } from 'astro';
import { FieldValue } from 'firebase-admin/firestore';
import { STEPS, routeProfile, worldForProfile } from '../../data/quiz';
import { quoteSlug, pickQuoteForFigures } from '../../data/quotes';
import { db } from '../../lib/firebase';
import { notifyTelegram, escapeMarkdown } from '../../lib/telegram';
import { parseUserAgent } from '../../lib/analytics/ua';
import { readGeo } from '../../lib/analytics/request';

export const prerender = false;

/** JSON response helper. */
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Allowed answer sets — derived from STEPS, never hand-copied.
const demo = STEPS.find((s) => s.id === 'demo') as Extract<
  (typeof STEPS)[number],
  { id: 'demo' }
>;
const life = STEPS.find((s) => s.id === 'life') as Extract<
  (typeof STEPS)[number],
  { id: 'life' }
>;
const inspires = STEPS.find((s) => s.id === 'inspires') as Extract<
  (typeof STEPS)[number],
  { id: 'inspires' }
>;

const AGES = new Set(demo.groups.find((g) => g.key === 'age')!.options);
const GENDERS = new Set(demo.groups.find((g) => g.key === 'gender')!.options);
const LIFE_LABELS = new Set(life.options.map((o) => o.label));
const FIGURE_NAMES = new Set(inspires.options.map((o) => o.name));
const PICK = inspires.pick;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESPONSE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const phoneOk = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

/**
 * One motivational quote for the welcome banner, drawn at random from the pooled
 * quotes of every figure the visitor picked. Reads Firestore `figure_quotes`
 * (seeded from src/data/quotes.json by scripts/seed-quotes.mjs); on any miss or
 * error it falls back to the bundled list so the banner is never bare.
 */
async function quoteForPicks(
  names: string[],
): Promise<{ text: string; attribution: string } | null> {
  const pool: { text: string; attribution: string }[] = [];
  try {
    const slugs = [...new Set(names.map(quoteSlug))];
    const snaps = await Promise.all(
      slugs.map((s) => db.collection('figure_quotes').doc(s).get()),
    );
    for (const snap of snaps) {
      const raw = snap.data();
      if (!raw || !Array.isArray(raw.quotes)) continue;
      for (const q of raw.quotes) {
        if (q && typeof q.text === 'string') {
          pool.push({ text: q.text, attribution: String(q.attribution ?? '') });
        }
      }
    }
  } catch (err) {
    console.error('figure_quotes read failed', err);
  }
  if (pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return pickQuoteForFigures(names);
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'invalid payload' }, 400);
  }

  // Honeypot: a real user never fills this. Accept, write nothing.
  if (body.company) return json({ ok: true }, 200);

  const complete = body.status === 'complete';
  const rawId = typeof body.responseId === 'string' ? body.responseId : '';
  if (rawId && !RESPONSE_ID_RE.test(rawId)) {
    return json({ ok: false, error: 'invalid responseId' }, 400);
  }

  const age = typeof body.age === 'string' ? body.age : '';
  const gender = typeof body.gender === 'string' ? body.gender : '';
  const lifeAnswer = typeof body.life === 'string' ? body.life : '';
  const inspiresIn = Array.isArray(body.inspires) ? body.inspires : [];
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';

  // Validate whatever is present. A `complete` call must have everything; a
  // `partial` call may carry a subset (or nothing yet).
  const inspiresValid =
    inspiresIn.every((n) => typeof n === 'string' && FIGURE_NAMES.has(n)) &&
    inspiresIn.length <= PICK;

  if (complete) {
    if (!AGES.has(age)) return json({ ok: false, error: 'invalid age' }, 400);
    if (!GENDERS.has(gender))
      return json({ ok: false, error: 'invalid gender' }, 400);
    if (!LIFE_LABELS.has(lifeAnswer))
      return json({ ok: false, error: 'invalid life' }, 400);
    if (!inspiresValid || inspiresIn.length !== PICK)
      return json({ ok: false, error: 'invalid inspires' }, 400);
  } else {
    if (age && !AGES.has(age))
      return json({ ok: false, error: 'invalid age' }, 400);
    if (gender && !GENDERS.has(gender))
      return json({ ok: false, error: 'invalid gender' }, 400);
    if (lifeAnswer && !LIFE_LABELS.has(lifeAnswer))
      return json({ ok: false, error: 'invalid life' }, 400);
    if (!inspiresValid)
      return json({ ok: false, error: 'invalid inspires' }, 400);
  }
  if (email && !EMAIL_RE.test(email))
    return json({ ok: false, error: 'invalid email' }, 400);
  if (phone && !phoneOk(phone))
    return json({ ok: false, error: 'invalid phone' }, 400);

  const inspiresOut = inspiresIn as string[];

  // Recompute server-side — ignore any `profile` the client sent. Only routable
  // once the life statement and both figures are in.
  const routable =
    LIFE_LABELS.has(lifeAnswer) && inspiresOut.length === PICK && inspiresValid;
  const profile = routable
    ? routeProfile({ age, gender, life: lifeAnswer, inspires: inspiresOut })
    : null;
  const world = profile ? worldForProfile(profile) : null;

  const ua = parseUserAgent(request.headers.get('user-agent'));
  const geo = readGeo(request);

  const data: Record<string, unknown> = {
    status: complete ? 'complete' : 'partial',
    age: age || null,
    gender: gender || null,
    life: lifeAnswer || null,
    inspires: inspiresOut,
    phone: phone || null,
    email: email || null,
    profile,
    world,
    emailStatus: email ? 'pending' : null,
    smsStatus: phone ? 'pending' : null,
    source: 'screen-one',
    userAgent: request.headers.get('user-agent') ?? null,
    referer: request.headers.get('referer') ?? null,
    deviceType: ua.deviceType,
    browser: ua.browser,
    browserVersion: ua.browserVersion,
    os: ua.os,
    osVersion: ua.osVersion,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (complete) data.completedAt = FieldValue.serverTimestamp();

  let previousEmail: string | null = null;
  let previousPhone: string | null = null;
  try {
    const col = db.collection('survey_responses');
    if (rawId) {
      const ref = col.doc(rawId);
      const snap = await ref.get();
      if (!snap.exists) {
        data.createdAt = FieldValue.serverTimestamp();
      } else {
        const prev = snap.data() ?? {};
        previousEmail = typeof prev.email === 'string' ? prev.email : null;
        previousPhone = typeof prev.phone === 'string' ? prev.phone : null;
      }
      await ref.set(data, { merge: true });
    } else {
      data.createdAt = FieldValue.serverTimestamp();
      await col.add(data);
    }
  } catch (err) {
    console.error('survey_responses write failed', err);
    return json({ ok: false, error: 'write failed' }, 500);
  }

  // Notify on a newly captured (or corrected) contact only — not on every
  // later quiz-step upsert that just resends the same value. Awaited so the
  // notification actually goes out before this serverless invocation ends.
  const newEmail = email && email !== previousEmail ? email : null;
  const newPhone = phone && phone !== previousPhone ? phone : null;
  if (newEmail || newPhone) {
    const lines = ['📩 *motivationalwallpaper.com* — new contact captured'];
    if (newEmail) lines.push(`Email: ${escapeMarkdown(newEmail)}`);
    if (newPhone) lines.push(`Phone: ${escapeMarkdown(newPhone)}`);
    const referer = request.headers.get('referer');
    if (referer) lines.push(`Referer: ${escapeMarkdown(referer)}`);
    await notifyTelegram(lines.join('\n'));
  }

  // On completion, hand back a quote for the welcome banner. Best-effort: a null
  // here just means the client uses its own bundled fallback.
  const quote = complete ? await quoteForPicks(inspiresOut) : null;

  return json({ ok: true, profile, world, quote }, 200);
};
