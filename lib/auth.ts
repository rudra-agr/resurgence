import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { pvMatches, pvOf, signToken, verifyToken } from '@/lib/token';

const TTL_SECONDS = 8 * 3600;
const isProd = () => process.env.NODE_ENV === 'production';
// SECURITY: the __Host- prefix makes browsers insist on Secure + path=/ + no Domain.
// Set, read and clear all use this one computed name.
const cookieName = () => (isProd() ? '__Host-rl_session' : 'rl_session');

export type Role = 'ADMIN' | 'COORDINATOR';
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  coordinatorId: string | null;
};

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
  return s;
}

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'strict' as const, // SECURITY: strict (was lax). The app never needs the cookie on cross-site navigations.
  secure: isProd(),
  path: '/',
});

export function setSessionCookie(uid: string, passwordHash: string) {
  cookies().set(cookieName(), signToken(secret(), uid, pvOf(passwordHash), TTL_SECONDS), {
    ...cookieOpts(),
    maxAge: TTL_SECONDS,
  });
}

export function clearSessionCookie() {
  // SECURITY: overwrite with an expired cookie carrying the same attributes. A bare delete would
  // omit Secure, and browsers refuse to change a __Host- cookie without it.
  cookies().set(cookieName(), '', { ...cookieOpts(), maxAge: 0 });
}

// Role is read from the database on every request, so changes apply immediately.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(cookieName())?.value;
  const t = token ? verifyToken(secret(), token) : null;
  if (!t) return null;
  const u = await prisma.user.findUnique({ where: { id: t.uid } });
  // SECURITY: a changed password changes pv, so old cookies stop working.
  if (!u || !pvMatches(t.pv, u.passwordHash)) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === 'ADMIN' ? 'ADMIN' : 'COORDINATOR',
    coordinatorId: u.coordinatorId,
  };
}

// Use at the top of every route that changes data:
//   const auth = await requireRole('COORDINATOR', 'ADMIN');
//   if ('error' in auth) return auth.error;
export async function requireRole(
  ...roles: Role[]
): Promise<{ user: SessionUser } | { error: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: 'Please log in.' }, { status: 401 }) };
  if (!roles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Not allowed.' }, { status: 403 }) };
  }
  return { user };
}

// A coordinator can only manage their own needs. Admins can manage all.
export const canManage = (user: SessionUser, need: { coordinatorId: string | null }) =>
  user.role === 'ADMIN' || (!!user.coordinatorId && need.coordinatorId === user.coordinatorId);
