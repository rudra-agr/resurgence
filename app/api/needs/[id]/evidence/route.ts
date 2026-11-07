import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { isValidId } from '@/lib/validate';
import { Refused, writeEvidence } from '@/lib/evidence';

const Body = z.object({
  type: z.enum(['PURCHASED', 'DELIVERED']),
  note: z.string().trim().min(5, 'Add a short evidence note (5+ characters).').max(300),
});

// Admin records that a purchase or delivery happened. (isSimulated),
// The rules live in lib/evidence.ts so the operations scheduler uses exactly the same code.

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  if (!isValidId(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const auth = await requireRole('ADMIN');
  if ('error' in auth) return auth.error;
  const limited = limit(`evidence:${auth.user.id}`, 30, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { type, note } = parsed.data;

  try {
    await prisma.$transaction((tx) => writeEvidence(tx, params.id, type, note, auth.user.name));
  } catch (e) {
    if (e instanceof Refused) return NextResponse.json({ error: e.reason }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
