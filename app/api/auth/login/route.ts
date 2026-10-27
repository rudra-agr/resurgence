import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { setSessionCookie } from '@/lib/auth';

const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter email and password.' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  // Same message for unknown email and wrong password, so nobody can probe for accounts.
  if (!user || !ok) return NextResponse.json({ error: 'Wrong email or password.' }, { status: 401 });

  setSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}
