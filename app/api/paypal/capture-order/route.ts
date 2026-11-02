import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { captureOrder, getOrder, PayPalError, type PayPalOrder } from '@/lib/paypal';
import { round2 } from '@/lib/products';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { clientIp, limit, MIN } from '@/lib/rateLimit';

const Body = z.object({ orderId: z.string().regex(/^[A-Za-z0-9-]{5,64}$/) });

const DECLINES: Record<string, string> = {
  INSTRUMENT_DECLINED: 'Your payment method was declined. Try another one.',
  PAYER_ACTION_REQUIRED: 'PayPal needs you to finish approving the payment.',
  ORDER_NOT_APPROVED: 'The payment was not approved in PayPal.',
};

// SECURITY: public route (donors need no account). Origin-checked and rate limited per IP.
export async function POST(req: Request) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  const limited = limit(`capture:${clientIp(req)}`, 20, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  const { orderId } = parsed.data;

  // IDEMPOTENCY, step 1: if this order is already recorded, answer success and change nothing.
  if (await prisma.funding.findUnique({ where: { orderId } })) {
    return NextResponse.json({ ok: true, duplicate: true });
  }


  // SECURITY (overfunding guard): look at the order BEFORE capturing. If it would push the need past
  // its target (or the need is already funded), refuse with 409 and do NOT take the money.
  // Orders that are already COMPLETED skip this and go through the normal idempotent path below.
  try {
    const pre = await getOrder(orderId);
    if (pre.status !== 'COMPLETED') {
      const u = pre.purchase_units?.[0];
      const preNeed = u?.custom_id ? await prisma.need.findUnique({ where: { id: u.custom_id } }) : null;
      const preAmount = Number(u?.amount?.value);
      if (preNeed && Number.isFinite(preAmount)) {
        const remaining = round2(preNeed.target - preNeed.raised);
        if (preNeed.status === 'FUNDED' || preAmount > remaining + 0.005) {
          return NextResponse.json(
            { error: 'This need no longer needs that amount. You were not charged.' },
            { status: 409 }
          );
        }
      }
    }
  } catch (e) {
    // Fail closed: if we cannot verify the amount, we do not capture.
    console.error('[paypal precheck]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not verify the payment. You were not charged.' }, { status: 502 });
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
  //const needId = unit?.custom_id; // set by our server when it created the order
    // custom_id was set by our server when it created the order. The capture response carries it on the
  // capture, not always on the unit, so fall back to the capture and then to a fresh read of the order.
  let needId = unit?.custom_id ?? cap?.custom_id;
  if (!needId) needId = (await getOrder(orderId).catch(() => null))?.purchase_units?.[0]?.custom_id;
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
      // SECURITY: lock the Need row so two simultaneous captures are recorded one after the other,
      // each seeing the other's total. (approve products locks the same row.)
      await tx.$queryRaw`SELECT id FROM "Need" WHERE id = ${need.id} FOR UPDATE`;
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
      // SECURITY: a captured payment is NEVER dropped. If a rare race still pushed the total past the
      // target, the payment is recorded as normal and this extra event tells an admin to refund the excess.
      const excess = round2(updated.raised - updated.target);
      if (updated.target > 0 && excess > 0.005) {
        await tx.auditEvent.create({
          data: {
            needId: need.id,
            type: 'OVERFUNDED',
            actor: 'PayPal sandbox',
            isSimulated: true,
            message: `Need is over its target by ${excess.toFixed(2)} ${cur}. Admin should refund the excess (capture ${cap.id})`,
          },
        });
      }
    });
  } catch (e) {
    // Unique constraint hit: another request recorded it first. Count it once.
    if ((e as { code?: string }).code === 'P2002') return NextResponse.json({ ok: true, duplicate: true });
    console.error('[capture record]', e);
    return NextResponse.json({ error: 'Payment captured but recording failed. Contact the organisers with your order ID: ' + orderId }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
