import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { captureOrder, getOrder, refundCapture, PayPalError, type PayPalCapture, type PayPalOrder } from '@/lib/paypal';
import { round2 } from '@/lib/products';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { clientIp, limit, MIN } from '@/lib/rateLimit';

const Body = z.object({ orderId: z.string().regex(/^[A-Za-z0-9-]{5,64}$/) });

const DECLINES: Record<string, string> = {
  INSTRUMENT_DECLINED: 'Your payment method was declined. Try another one.',
  PAYER_ACTION_REQUIRED: 'PayPal needs you to finish approving the payment.',
  ORDER_NOT_APPROVED: 'The payment was not approved in PayPal.',
};

// Same bounds as create-order. Enforced again here because the PayPal client ID is public,
// so someone can create an order directly with PayPal and skip our create-order route.
const MIN_DONATION = 1;
const MAX_DONATION = 10_000;

// After money has been captured, any failure must not leave the donor charged with no record.
// Try to refund in full, and leave an audit event (when we know the need) so an admin can see it.
async function refundAndLog(needId: string | null, cap: PayPalCapture, reason: string, orderId: string): Promise<boolean> {
  let refunded = false;
  try {
    await refundCapture(cap.id);
    refunded = true;
  } catch (e) {
    console.error('[auto-refund failed]', orderId, cap.id, e instanceof Error ? e.message : e);
  }
  console.error('[post-capture failure]', { orderId, captureId: cap.id, reason, refunded });
  if (needId) {
    try {
      await prisma.auditEvent.create({
        data: {
          needId,
          type: 'PAYMENT_FAILED',
          actor: 'PayPal sandbox',
          isSimulated: true,
          message: refunded
            ? `Payment not recorded (${reason}). Automatically refunded (capture ${cap.id}). Nothing was added to the total`
            : `Payment captured but NOT recorded (${reason}). Automatic refund failed, admin must refund capture ${cap.id}`,
        },
      });
    } catch (e) {
      console.error('[audit write failed]', e);
    }
  }
  return refunded;
}

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
    // Already-COMPLETED orders skip this and go through the normal idempotent path below.
    if (pre.status !== 'COMPLETED') {
      const u = pre.purchase_units?.[0];
      const preAmount = Number(u?.amount?.value);
      const preNeed = u?.custom_id
        ? await prisma.need.findUnique({ where: { id: u.custom_id }, include: { region: true } })
        : null;

      // R3: never capture an order that does not resolve to a known need.
      if (!preNeed) {
        return NextResponse.json({ error: 'This payment does not belong to a known need. You were not charged.' }, { status: 400 });
      }
      if (preNeed.target <= 0) {
        return NextResponse.json({ error: 'This need cannot take donations yet. You were not charged.' }, { status: 409 });
      }
      // R3: currency must match the need's region, as set by our server.
      if (u?.amount?.currency_code !== preNeed.region.currency) {
        return NextResponse.json({ error: 'Payment currency does not match this need. You were not charged.' }, { status: 400 });
      }
      // R4: same min and max as create-order.
      if (!Number.isFinite(preAmount) || preAmount < MIN_DONATION || preAmount > MAX_DONATION) {
        return NextResponse.json(
          { error: `Donations must be between ${MIN_DONATION} and ${MAX_DONATION}. You were not charged.` },
          { status: 400 }
        );
      }
      // Overfunding guard (unchanged behaviour).
      const remaining = round2(preNeed.target - preNeed.raised);
      if (preNeed.status === 'FUNDED' || preAmount > remaining + 0.005) {
        return NextResponse.json(
          { error: 'This need no longer needs that amount. You were not charged.' },
          { status: 409 }
        );
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

  if (!need) {
    // Money may have moved. Refund if the capture completed.
    if (cap && cap.status === 'COMPLETED') {
      const refunded = await refundAndLog(null, cap, 'unknown need', orderId);
      return NextResponse.json(
        { error: refunded
            ? 'This payment does not belong to a known need. It was refunded.'
            : 'This payment does not belong to a known need. Contact the organisers with your order ID: ' + orderId },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'This payment does not belong to a known need.' }, { status: 400 });
  }

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
  if (
    cur !== need.region.currency ||
    !Number.isFinite(amount) ||
    amount < MIN_DONATION ||
    amount > MAX_DONATION
  ) {
    const refunded = await refundAndLog(need.id, cap, 'currency or amount rejected', orderId);
    return NextResponse.json(
      { error: refunded
          ? 'Payment currency or amount is not allowed for this need. It was refunded.'
          : 'Payment currency or amount is not allowed. Contact the organisers with your order ID: ' + orderId },
      { status: 400 }
    );
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
    // If it actually got recorded (e.g. the error came after commit), do not refund it.
    if (await prisma.funding.findUnique({ where: { orderId } }).catch(() => null)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    const refunded = await refundAndLog(need.id, cap, 'recording failed', orderId);
    return NextResponse.json(
      { error: refunded
          ? 'We could not record your payment, so it was refunded. Please try again.'
          : 'Payment captured but recording failed. Contact the organisers with your order ID: ' + orderId },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
