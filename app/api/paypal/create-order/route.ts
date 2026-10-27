import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createOrder, PayPalError } from '@/lib/paypal';
import { round2 } from '@/lib/products';

const Body = z.object({
  needId: z.string().min(1).max(60),
  amount: z.coerce.number().min(1, 'Minimum donation is 1.').max(10_000, 'Maximum is 10,000.'),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  // Currency and limits come from our database, never from the browser.
  const need = await prisma.need.findUnique({ where: { id: parsed.data.needId }, include: { region: true } });
  if (!need) return NextResponse.json({ error: 'Need not found.' }, { status: 404 });
  if (need.target <= 0) {
    return NextResponse.json({ error: 'Products are not approved yet, so this need cannot take donations.' }, { status: 409 });
  }
  const remaining = round2(need.target - need.raised);
  if (need.status === 'FUNDED' || remaining <= 0) {
    return NextResponse.json({ error: 'This need is already fully funded.' }, { status: 409 });
  }
  const amount = round2(parsed.data.amount);
  if (amount > remaining) {
    return NextResponse.json({ error: `Only ${remaining.toFixed(2)} ${need.region.currency} is still needed.` }, { status: 400 });
  }

  try {
    const o = await createOrder(need.id, amount, need.region.currency);
    return NextResponse.json({ id: o.id });
  } catch (e) {
    console.error('[paypal create]', e instanceof Error ? e.message : e);
    const msg = e instanceof PayPalError ? e.message : 'Could not start the payment.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
