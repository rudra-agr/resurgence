import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const COOKIE = 'rl_session';
const TTL_SECONDS = 8 * 3600;

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

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

// The cookie holds only the user id and an expiry, signed so it cannot be forged or edited.
function makeToken(uid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof uid === 'string' && exp > Date.now() / 1000 ? uid : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(uid: string) {
  cookies().set(COOKIE, makeToken(uid), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

// Role is read from the database on every request, so changes apply immediately.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  const uid = token ? readToken(token) : null;
  if (!uid) return null;
  const u = await prisma.user.findUnique({ where: { id: uid } });
  if (!u) return null;
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
