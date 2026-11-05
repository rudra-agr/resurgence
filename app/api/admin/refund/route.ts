import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { refundCapture, PayPalError } from '@/lib/paypal';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { clientIp, limit, MIN } from '@/lib/rateLimit';

const Body = z.object({ fundingId: z.string().min(1).max(60) });

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  const auth = await requireRole('ADMIN');
  if ('error' in auth) return auth.error;
  const limited = limit(`refund:${clientIp(req)}`, 10, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const f = await prisma.funding.findUnique({ where: { id: parsed.data.fundingId } });
  if (!f) return NextResponse.json({ error: 'Donation not found.' }, { status: 404 });
  if (f.status === 'REFUNDED') return NextResponse.json({ error: 'Already refunded.' }, { status: 409 });

  try {
    await refundCapture(f.captureId);
  } catch (e) {
    // Already refunded on PayPal's side: fall through and just fix our records.
    if (!(e instanceof PayPalError && e.issue === 'CAPTURE_FULLY_REFUNDED')) {
      console.error('[paypal refund]', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 'PayPal could not refund this payment.' }, { status: 502 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Need" WHERE id = ${f.needId} FOR UPDATE`;
    const cur = await tx.funding.findUnique({ where: { id: f.id } });
    if (!cur || cur.status === 'REFUNDED') return; // double click / second tab

    await tx.funding.update({ where: { id: f.id }, data: { status: 'REFUNDED' } });
    const need = await tx.need.update({
      where: { id: f.needId },
      data: { raised: { decrement: f.amount } },
      select: { raised: true, target: true, status: true },
    });
    if (need.status === 'FUNDED' && need.raised < need.target - 0.005) {
      await tx.need.update({ where: { id: f.needId }, data: { status: 'OPEN' } });
    }
    await tx.auditEvent.create({
      data: {
        needId: f.needId,
        type: 'REFUNDED',
        actor: auth.user.name,
        isSimulated: true,
        message: `Sandbox refund of ${f.amount.toFixed(2)} ${f.currency} issued (capture ${f.captureId})`,
      },
    });
  });

  return NextResponse.json({ ok: true });
}