import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Pure session-token helpers (no Next.js or database imports) so they can be unit tested.

// SECURITY: "pv" = first 16 hex chars of sha256(passwordHash). It is stored in the cookie and
// compared with the user's current hash, so changing a password kills all old sessions
// without any schema change.
export const pvOf = (passwordHash: string): string =>
  createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);

export function pvMatches(tokenPv: string, passwordHash: string): boolean {
  const a = Buffer.from(tokenPv);
  const b = Buffer.from(pvOf(passwordHash));
  return a.length === b.length && timingSafeEqual(a, b);
}

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export function signToken(secret: string, uid: string, pv: string, ttlSeconds: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const payload = Buffer.from(JSON.stringify({ uid, pv, exp: nowSec + ttlSeconds })).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

// SECURITY: the HMAC signature is verified BEFORE the payload is JSON-parsed.
export function verifyToken(secret: string, token: string, nowSec = Math.floor(Date.now() / 1000)): { uid: string; pv: string } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(secret, payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, pv, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof uid === 'string' && typeof pv === 'string' && typeof exp === 'number' && exp > nowSec
      ? { uid, pv }
      : null;
  } catch {
    return null;
  }
}
