import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrder, verifyWebhookSignature } from '@/lib/paypal';
import { round2 } from '@/lib/products';
import { limit, MIN } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Same bounds as create-order and capture-order.
const MIN_DONATION = 1;
const MAX_DONATION = 10_000;
const CAPTURE_ID = /^[A-Za-z0-9-]{5,64}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Res = {
  id?: string;
  status?: string;
  amount?: { value?: string; currency_code?: string };
  supplementary_data?: { related_ids?: { order_id?: string } };
  links?: { rel?: string; href?: string }[];
  // dispute events
  dispute_id?: string;
  reason?: string;
  disputed_transactions?: { seller_transaction_id?: string }[];
};
type WebhookEvent = { id?: string; event_type?: string; resource?: Res };

// PAYMENT.CAPTURE.COMPLETED: safety net. If the donor's browser never called capture-order,
// PayPal has the money but our ledger does not. Record it, using the same rules and the same
// unique keys, so the browser path and this path can never both count the same payment.
async function onCaptureCompleted(res: Res) {
  const captureId = res.id;
  const orderId = res.supplementary_data?.related_ids?.order_id;
  if (!captureId || !orderId || !CAPTURE_ID.test(captureId) || !CAPTURE_ID.test(orderId)) return;

  const recorded = () => prisma.funding.findFirst({ where: { OR: [{ orderId }, { captureId }] }, select: { id: true } });
  if (await recorded()) return;
  await sleep(4000); // the donor's browser normally records it within a second or two
  if (await recorded()) return;

  // Re-read the order from PayPal. Never trust amounts from the webhook body.
  const order = await getOrder(orderId);
  const unit = order.purchase_units?.[0];
  const cap = unit?.payments?.captures?.find((c) => c.id === captureId);
  if (!cap || cap.status !== 'COMPLETED') return;
  const needId = unit?.custom_id ?? cap.custom_id;
  if (!needId) {
    console.error('[webhook] capture without a need, ignored', { orderId, captureId });
    return;
  }
  const need = await prisma.need.findUnique({ where: { id: needId }, include: { region: true } });
  const amount = Number(cap.amount.value);
  const cur = cap.amount.currency_code;
  if (!need || cur !== need.region.currency || !Number.isFinite(amount) || amount < MIN_DONATION || amount > MAX_DONATION) {
    console.error('[webhook] capture rejected by rules, needs admin review in PayPal', { orderId, captureId });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Need" WHERE id = ${need.id} FOR UPDATE`;
      await tx.funding.create({
        data: {
          needId: need.id,
          orderId,
          captureId,
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
      await tx.auditEvent.create({
        data: {
          needId: need.id,
          type: full ? 'FUNDED' : 'PARTIALLY_FUNDED',
          actor: 'PayPal webhook',
          isSimulated: true,
          message: `Sandbox payment of ${amount.toFixed(2)} ${cur} confirmed by PayPal webhook (capture ${captureId})`,
        },
      });
      const excess = round2(updated.raised - updated.target);
      if (updated.target > 0 && excess > 0.005) {
        await tx.auditEvent.create({
          data: {
            needId: need.id,
            type: 'OVERFUNDED',
            actor: 'PayPal webhook',
            isSimulated: true,
            message: `Need is over its target by ${excess.toFixed(2)} ${cur}. Admin should refund the excess (capture ${captureId})`,
          },
        });
      }
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return; // the browser path recorded it first
    throw e;
  }
}

// PAYMENT.CAPTURE.REFUNDED: a refund finished on PayPal's side. If it was made from the PayPal
// dashboard (not our admin button) our ledger would still count it. Fix our records the same way
// the admin refund route does. Partial refunds are only logged: an admin decides what to do.
async function onCaptureRefunded(res: Res) {
  if (res.status !== 'COMPLETED') return;
  const captureId = res.links?.find((l) => l.rel === 'up')?.href?.split('/').pop();
  if (!captureId || !CAPTURE_ID.test(captureId)) return;

  await sleep(4000); // lets our own admin refund route finish first, so the audit trail names the admin
  const f = await prisma.funding.findFirst({ where: { captureId } });
  if (!f || f.status === 'REFUNDED') return;

  const refunded = Number(res.amount?.value);
  if (!Number.isFinite(refunded) || refunded < f.amount - 0.005) {
    console.error('[webhook] partial refund, not changing totals', { captureId, refunded });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Need" WHERE id = ${f.needId} FOR UPDATE`;
    const cur = await tx.funding.findUnique({ where: { id: f.id } });
    if (!cur || cur.status === 'REFUNDED') return;
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
        actor: 'PayPal webhook',
        isSimulated: true,
        message: `Sandbox refund of ${f.amount.toFixed(2)} ${f.currency} confirmed by PayPal webhook (capture ${captureId})`,
      },
    });
  });
}

// PAYMENT.CAPTURE.REVERSED: PayPal took a payment back (for example a dispute). We only leave a
// warning on the timeline. Totals are not changed automatically, so an admin reviews it first.
async function onCaptureReversed(res: Res) {
  const captureId = res.id;
  if (!captureId || !CAPTURE_ID.test(captureId)) return;
  const f = await prisma.funding.findFirst({ where: { captureId } });
  if (!f || f.status === 'REFUNDED') return;
  const message = `PayPal reported this payment as reversed (capture ${captureId}). An admin should review it in PayPal. Totals were not changed`;
  const seen = await prisma.auditEvent.findFirst({ where: { needId: f.needId, type: 'PAYMENT_FAILED', message }, select: { id: true } });
  if (seen) return;
  await prisma.auditEvent.create({
    data: { needId: f.needId, type: 'PAYMENT_FAILED', actor: 'PayPal webhook', isSimulated: true, message },
  });
}

// PAYMENT.CAPTURE.DENIED: PayPal refused the payment. It was never counted, so only a timeline note.
async function onCaptureDenied(res: Res) {
  const captureId = res.id;
  const orderId = res.supplementary_data?.related_ids?.order_id;
  if (!captureId || !orderId || !CAPTURE_ID.test(captureId) || !CAPTURE_ID.test(orderId)) return;

  const f = await prisma.funding.findFirst({ where: { captureId } });
  let needId = f?.needId;
  if (!needId) {
    const unit = (await getOrder(orderId)).purchase_units?.[0];
    const cid = unit?.custom_id ?? unit?.payments?.captures?.find((c) => c.id === captureId)?.custom_id;
    if (cid && (await prisma.need.findUnique({ where: { id: cid }, select: { id: true } }))) needId = cid;
  }
  if (!needId) return;

  const message = f
    ? `PayPal reported this recorded payment as denied (capture ${captureId}). An admin should review it in PayPal. Totals were not changed`
    : `PayPal denied a payment for this need (capture ${captureId}). Nothing was added to the total`;
  const seen = await prisma.auditEvent.findFirst({ where: { needId, type: 'PAYMENT_FAILED', message }, select: { id: true } });
  if (seen) return;
  await prisma.auditEvent.create({
    data: { needId, type: 'PAYMENT_FAILED', actor: 'PayPal webhook', isSimulated: true, message },
  });
}

// CUSTOMER.DISPUTE.CREATED: a donor opened a dispute. Leave a warning for an admin. Totals unchanged.
async function onDisputeCreated(res: Res) {
  const captureId = res.disputed_transactions?.[0]?.seller_transaction_id;
  if (!captureId || !CAPTURE_ID.test(captureId)) return;
  const f = await prisma.funding.findFirst({ where: { captureId } });
  if (!f) return;
  // Only short, plain tokens from PayPal go into our message.
  const disputeId = res.dispute_id && /^[A-Za-z0-9-]{5,40}$/.test(res.dispute_id) ? res.dispute_id : null;
  const reason = res.reason && /^[A-Z_]{3,60}$/.test(res.reason) ? res.reason : null;
  const message =
    `A dispute was opened for this payment${disputeId ? ` (dispute ${disputeId})` : ''} (capture ${captureId})` +
    `${reason ? `, reason ${reason}` : ''}. An admin should review it in PayPal. Totals were not changed`;
  const seen = await prisma.auditEvent.findFirst({ where: { needId: f.needId, type: 'PAYMENT_FAILED', message }, select: { id: true } });
  if (seen) return;
  await prisma.auditEvent.create({
    data: { needId: f.needId, type: 'PAYMENT_FAILED', actor: 'PayPal webhook', isSimulated: true, message },
  });
}

// SECURITY: public by design (PayPal calls it), so it is not origin-checked. Nothing is acted on
// until PayPal's own signature check says SUCCESS. A global rate limit protects the verify call.
export async function POST(req: Request) {
  const limited = limit('webhook:global', 120, MIN);
  if (limited) return limited;
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: 'Too large.' }, { status: 413 });

  let verified = false;
  try {
    verified = await verifyWebhookSignature(req.headers, raw);
  } catch (e) {
    console.error('[webhook verify]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not verify.' }, { status: 500 }); // PayPal will retry
  }
  if (!verified) return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });

  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  try {
    const res = event.resource ?? {};
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') await onCaptureCompleted(res);
    else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') await onCaptureRefunded(res);
    else if (event.event_type === 'PAYMENT.CAPTURE.REVERSED') await onCaptureReversed(res);
    else if (event.event_type === 'PAYMENT.CAPTURE.DENIED') await onCaptureDenied(res);
    else if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') await onDisputeCreated(res);
    // Any other verified event is acknowledged and ignored.
  } catch (e) {
    console.error('[webhook handler]', event.event_type, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 }); // PayPal will retry
  }
  return NextResponse.json({ ok: true });
}
