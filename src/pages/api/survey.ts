/**
 * POST /api/survey — the one and only backend call in Screen One.
 *
 * The client posts the full survey payload once, at completion, fire-and-forget
 * (see Quiz.astro `finish()`). This route:
 *   1. parses JSON        → 400 on bad JSON
 *   2. checks the honeypot → 200 {ok:true}, writes nothing, if `company` is set
 *   3. validates the payload against the allowed sets derived from STEPS
 *   4. recomputes `profile` server-side (any client-sent `profile` is ignored)
 *   5. writes one row to Firestore `survey_responses` via the Admin SDK
 *
 * Channel tools (Beehiiv / SMS) are deferred: a present contact is stamped
 * `pending` so a later migration can pick it up. Nothing is sent here.
 *
 * Follow-up: no rate limiting / CAPTCHA beyond the honeypot yet.
 */
import type { APIRoute } from 'astro';
import { FieldValue } from 'firebase-admin/firestore';
import { STEPS, routeProfile, worldForProfile } from '../../data/quiz';
import { db } from '../../lib/firebase';

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
const phoneOk = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

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

  const age = typeof body.age === 'string' ? body.age : '';
  const gender = typeof body.gender === 'string' ? body.gender : '';
  const lifeAnswer = typeof body.life === 'string' ? body.life : '';
  const inspiresIn = Array.isArray(body.inspires) ? body.inspires : null;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';

  if (!AGES.has(age)) return json({ ok: false, error: 'invalid age' }, 400);
  if (!GENDERS.has(gender))
    return json({ ok: false, error: 'invalid gender' }, 400);
  if (!LIFE_LABELS.has(lifeAnswer))
    return json({ ok: false, error: 'invalid life' }, 400);
  if (
    !inspiresIn ||
    inspiresIn.length !== PICK ||
    !inspiresIn.every((n) => typeof n === 'string' && FIGURE_NAMES.has(n))
  ) {
    return json({ ok: false, error: 'invalid inspires' }, 400);
  }
  if (email && !EMAIL_RE.test(email))
    return json({ ok: false, error: 'invalid email' }, 400);
  if (phone && !phoneOk(phone))
    return json({ ok: false, error: 'invalid phone' }, 400);

  const inspiresOut = inspiresIn as string[];

  // Recompute server-side — ignore any `profile` the client sent.
  const profile = routeProfile({ age, gender, life: lifeAnswer, inspires: inspiresOut });
  const world = worldForProfile(profile);

  try {
    await db.collection('survey_responses').add({
      age,
      gender,
      life: lifeAnswer,
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
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('survey_responses write failed', err);
    return json({ ok: false, error: 'write failed' }, 500);
  }

  return json({ ok: true, profile, world }, 200);
};
