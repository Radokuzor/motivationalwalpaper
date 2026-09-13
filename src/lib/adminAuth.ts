/**
 * HTTP Basic Auth gate for /admin. Shared-credential, no session, no audit
 * log — fine for a single-operator internal tool over Vercel's HTTPS.
 */
import { timingSafeEqual } from 'node:crypto';

const env = { ...process.env, ...import.meta.env } as Record<string, string | undefined>;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Returns a 401/500 Response to send back, or null if the request is authorized. */
export function requireBasicAuth(request: Request): Response | null {
  const expectedUser = env.ADMIN_USER ?? 'admin';
  const expectedPassword = env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    console.error('ADMIN_PASSWORD is unset — /admin refuses to run open');
    return new Response('Admin auth is not configured', { status: 500 });
  }

  const unauthorized = () =>
    new Response('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="admin"' },
    });

  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return unauthorized();

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return unauthorized();
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) return unauthorized();
  const user = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  if (!safeEqual(user, expectedUser) || !safeEqual(password, expectedPassword)) {
    return unauthorized();
  }
  return null;
}
