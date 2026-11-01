import { NextResponse } from 'next/server';

const deny = (status: number, error: string) => NextResponse.json({ error }, { status });

// SECURITY: same-origin check for every state-changing request (defence in depth on top of
// the SameSite cookie). Returns a 403 response to send back, or null when the request is fine.
export function assertSameOrigin(req: { headers: Headers }): NextResponse | null {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return deny(403, 'Cross-site request blocked.');

  const origin = req.headers.get('origin');
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return deny(403, 'Cross-site request blocked.'); // "null" or garbage Origin
    }
    if (originHost !== req.headers.get('host')) return deny(403, 'Cross-site request blocked.');
  }
  return null;
}

// SECURITY: routes that parse JSON must be sent as application/json. A cross-site HTML form
// can only send text/plain, form-urlencoded or multipart, so this blocks "simple" forged posts.
export function requireJson(req: { headers: Headers }): NextResponse | null {
  const ct = req.headers.get('content-type') ?? '';
  return /^application\/json\s*(;|$)/i.test(ct) ? null : deny(415, 'Content-Type must be application/json.');
}
