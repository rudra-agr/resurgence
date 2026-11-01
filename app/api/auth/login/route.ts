// SECURITY: public route (no role). Same-origin + JSON-only + rate limits run BEFORE any
// database or scrypt work.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyDummy, verifyPassword } from '@/lib/password';
import { setSessionCookie } from '@/lib/auth';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { clientIp, limit, QUARTER_HOUR } from '@/lib/rateLimit';

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;

  // Per-IP cap first: 20 attempts / 15 min, counted before the body is even parsed.
  const ip = clientIp(req);
  const ipLimited = limit(`login:ip:${ip}`, 20, QUARTER_HOUR);
  if (ipLimited) return ipLimited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter email and password.' }, { status: 400, headers: NO_STORE });

  // Per IP + email: 5 attempts / 15 min. Checked before scrypt so brute force is cheap to refuse.
  const email = parsed.data.email.toLowerCase();
  const pairLimited = limit(`login:pair:${ip}:${email}`, 5, QUARTER_HOUR);
  if (pairLimited) return pairLimited;

  const user = await prisma.user.findUnique({ where: { email } });
  // SECURITY: unknown emails run a dummy scrypt so both cases take about the same time.
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : await verifyDummy(parsed.data.password);
  // Same message for unknown email and wrong password, so nobody can probe for accounts.
  if (!user || !ok) return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401, headers: NO_STORE });

  setSessionCookie(user.id, user.passwordHash);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
