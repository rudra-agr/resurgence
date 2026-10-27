import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { captureOrder, getOrder, PayPalError, type PayPalOrder } from '@/lib/paypal';

const Body = z.object({ orderId: z.string().regex(/^[A-Za-z0-9-]{5,64}$/) });

const DECLINES: Record<string, string> = {
  INSTRUMENT_DECLINED: 'Your payment method was declined. Try another one.',
  PAYER_ACTION_REQUIRED: 'PayPal needs you to finish approving the payment.',
  ORDER_NOT_APPROVED: 'The payment was not approved in PayPal.',
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  const { orderId } = parsed.data;

  // IDEMPOTENCY, step 1: if this order is already recorded, answer success and change nothing.
  if (await prisma.funding.findUnique({ where: { orderId } })) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // The server captures the order itself and never trusts the browser's word that it paid.
  let order: PayPalOrder;
  try {
    order = await captureOrder(orderId);
  } catch (e) {
    if (e instanceof PayPalError && e.issue === 'ORDER_ALREADY_CAPTURED') {
      // IDEMPOTENCY, step 2: a retry or a second tab. PayPal refuses a second capture,
      // so fetch the finished order and continue to the (unique-protected) recording step.
      order = await getOrder(orderId);
    } else {
      console.error('[paypal capture]', e instanceof Error ? e.message : e);
      const msg = e instanceof PayPalError && e.issue && DECLINES[e.issue];
      return NextResponse.json({ error: msg || 'The payment could not be completed. You were not charged.' }, { status: 402 });
    }
  }

  const unit = order.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  const needId = unit?.custom_id; // set by our server when it created the order
  const need = needId ? await prisma.need.findUnique({ where: { id: needId }, include: { region: true } }) : null;

  if (!need) return NextResponse.json({ error: 'This payment does not belong to a known need.' }, { status: 400 });

  if (order.status !== 'COMPLETED' || !cap || cap.status !== 'COMPLETED') {
    // Failed or pending payments never touch the totals, but they are visible on the timeline.
    await prisma.auditEvent.create({
      data: {
        needId: need.id,
        type: 'PAYMENT_FAILED',
        actor: 'PayPal sandbox',
        isSimulated: true,
        message: `Sandbox payment not completed (order ${order.status}, capture ${cap?.status ?? 'none'}). Nothing was added to the total`,
      },
    });
    return NextResponse.json({ error: 'The payment is not complete, so it was not counted.' }, { status: 400 });
  }

  const amount = Number(cap.amount.value);
  const cur = cap.amount.currency_code;
  if (cur !== need.region.currency || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Payment currency does not match this need.' }, { status: 400 });
  }

  try {
    // One transaction keeps the funding row, running total and audit event consistent.
    // orderId and captureId are both unique, so the same payment can never be counted twice.
    await prisma.$transaction(async (tx) => {
      await tx.funding.create({
        data: {
          needId: need.id,
          orderId,
          captureId: cap.id,
          amount,
          currency: cur,
          payer: order.payer?.name?.given_name || 'Anonymous',
          status: 'CAPTURED',
          isSandbox: true,
        },
      });
      const updated = await tx.need.update({
        where: { id: need.id },
        data: { raised: { increment: amount } },
        select: { raised: true, target: true },
      });
      const full = updated.target > 0 && updated.raised >= updated.target - 0.005;
      if (full) await tx.need.update({ where: { id: need.id }, data: { status: 'FUNDED' } });
      // AuditEvent rows are only ever inserted, never edited or deleted.
      await tx.auditEvent.create({
        data: {
          needId: need.id,
          type: full ? 'FUNDED' : 'PARTIALLY_FUNDED',
          actor: 'PayPal sandbox',
          isSimulated: true,
          message: `Sandbox payment of ${amount.toFixed(2)} ${cur} confirmed on the server (capture ${cap.id})`,
        },
      });
    });
  } catch (e) {
    // Unique constraint hit: another request recorded it first. Count it once.
    if ((e as { code?: string }).code === 'P2002') return NextResponse.json({ ok: true, duplicate: true });
    console.error('[capture record]', e);
    return NextResponse.json({ error: 'Payment captured but recording failed. Contact the organisers with your order ID: ' + orderId }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
