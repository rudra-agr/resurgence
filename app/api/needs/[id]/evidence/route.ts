import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { isValidId } from '@/lib/validate';

class Refused extends Error {
  constructor(public reason: string, public status: number) {
    super(reason);
  }
}

const Body = z.object({
  type: z.enum(['PURCHASED', 'DELIVERED']),
  note: z.string().trim().min(5, 'Add a short evidence note (5+ characters).').max(300),
});

// Admin records that a purchase or delivery happened. (isSimulated),

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
  const label = type === 'PURCHASED' ? 'Purchase' : 'Delivery';

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Need" WHERE id = ${params.id} FOR UPDATE`;
      const need = await tx.need.findUnique({ where: { id: params.id }, select: { status: true } });
      if (!need) throw new Refused('Need not found.', 404);
      if (need.status !== 'FUNDED') throw new Refused('Purchase can only be recorded after the need is fully funded.', 409);
      const prior = await tx.auditEvent.findMany({
        where: { needId: params.id, type: { in: ['PURCHASED', 'DELIVERED'] } },
        select: { type: true },
      });
      const done = (t: string) => prior.some((e) => e.type === t);
      if (done(type)) throw new Refused(`${label} is already recorded.`, 409);
      if (type === 'DELIVERED' && !done('PURCHASED')) throw new Refused('Record the purchase before delivery.', 409);
      await tx.auditEvent.create({
        data: {
          needId: params.id,
          type,
          actor: auth.user.name,
          message: `${label} recorded by admin as TEST evidence. Note: ${note}`,
          isSimulated: true,
        },
      });
    });
  } catch (e) {
    if (e instanceof Refused) return NextResponse.json({ error: e.reason }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
}