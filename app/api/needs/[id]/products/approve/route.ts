import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, canManage } from '@/lib/auth';
import { round2 } from '@/lib/products';

const Body = z.object({
  choices: z
    .array(
      z
        .object({
          itemId: z.string().min(1),
          matchId: z.string().min(1).optional(),
          manual: z
            .object({
              productName: z.string().trim().min(1).max(160),
              price: z.number().positive().max(10_000_000),
              url: z.string().url().max(500).optional(),
            })
            .optional(),
        })
        // Each item needs exactly one choice: a found product or a manual one.
        .refine((c) => !!c.matchId !== !!c.manual, 'Pick a product or enter one manually.')
    )
    .min(1)
    .max(20),
});

// The coordinator approves one product per item. This sets the funding target
// and writes the audit event. Manual entries are labelled as manual.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole('COORDINATOR', 'ADMIN');
  if ('error' in auth) return auth.error;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const need = await prisma.need.findUnique({
    where: { id: params.id },
    include: { items: { include: { matches: true } }, region: true, fundings: { select: { id: true }, take: 1 } },
  });
  if (!need) return NextResponse.json({ error: 'Need not found.' }, { status: 404 });
  if (!canManage(auth.user, need)) return NextResponse.json({ error: 'Not your need.' }, { status: 403 });
  if (need.fundings.length) {
    return NextResponse.json({ error: 'This need already has donations, so products are locked.' }, { status: 409 });
  }

  const choices = parsed.data.choices;
  const byItem = new Map(choices.map((c) => [c.itemId, c]));
  if (byItem.size !== choices.length || byItem.size !== need.items.length || need.items.some((i) => !byItem.has(i.id))) {
    return NextResponse.json({ error: 'Choose one product for every item.' }, { status: 400 });
  }

  let total = 0;
  let manualCount = 0;
  const ops = [];
  for (const item of need.items) {
    const c = byItem.get(item.id)!;
    let price: number;
    ops.push(prisma.productMatch.updateMany({ where: { itemId: item.id }, data: { approved: false } }));
    if (c.matchId) {
      const m = item.matches.find((x) => x.id === c.matchId); // must belong to this item
      if (!m) return NextResponse.json({ error: 'Unknown product for an item.' }, { status: 400 });
      price = m.price;
      ops.push(prisma.productMatch.update({ where: { id: m.id }, data: { approved: true } }));
    } else {
      price = c.manual!.price;
      manualCount++;
      ops.push(
        prisma.productMatch.create({
          data: {
            itemId: item.id,
            source: 'manual',
            manual: true,
            productName: c.manual!.productName,
            price,
            currency: need.region.currency,
            url: c.manual!.url ?? null,
            approved: true,
          },
        })
      );
    }
    total += price * item.quantity;
  }
  total = round2(total);

  await prisma.$transaction([
    ...ops,
    prisma.need.update({ where: { id: need.id }, data: { target: total, status: 'OPEN' } }),
    // Append-only: every approval is a new row.
    prisma.auditEvent.create({
      data: {
        needId: need.id,
        type: 'PRODUCTS_MATCHED',
        actor: auth.user.name,
        message: `Products approved: ${need.items.length - manualCount} from Channel3, ${manualCount} entered manually. Funding target ${total.toFixed(2)} ${need.region.currency}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, target: total });
}
