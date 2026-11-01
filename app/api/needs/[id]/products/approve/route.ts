import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole, canManage } from '@/lib/auth';
import { round2 } from '@/lib/products';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { httpUrl, isValidId } from '@/lib/validate';

class AlreadyFunded extends Error {}
const FUNDED_MSG = 'This need already has donations, so products are locked.';

const Body = z.object({
  choices: z
    .array(
      z
        .object({
          itemId: z.string().min(1).max(60),
          matchId: z.string().min(1).max(60).optional(),
          manual: z
            .object({
              productName: z.string().trim().min(1).max(160),
              price: z.number().positive().max(10_000_000),
              url: httpUrl.optional(), // SECURITY: http(s) only (no javascript: links)
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
// SECURITY: requires role COORDINATOR or ADMIN (and ownership via canManage).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  if (!isValidId(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const auth = await requireRole('COORDINATOR', 'ADMIN');
  if ('error' in auth) return auth.error;
  const limited = limit(`approve:${auth.user.id}`, 30, MIN);
  if (limited) return limited;

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
    return NextResponse.json({ error: FUNDED_MSG }, { status: 409 });
  }

  const choices = parsed.data.choices;
  const byItem = new Map(choices.map((c) => [c.itemId, c]));
  if (byItem.size !== choices.length || byItem.size !== need.items.length || need.items.some((i) => !byItem.has(i.id))) {
    return NextResponse.json({ error: 'Choose one product for every item.' }, { status: 400 });
  }

  // Validate every choice and work out the data first. Nothing is written yet.
  type Plan = { itemId: string; approveId?: string; manual?: { productName: string; price: number; url: string | null } };
  const plans: Plan[] = [];
  let total = 0;
  let manualCount = 0;
  for (const item of need.items) {
    const c = byItem.get(item.id)!;
    let price: number;
    if (c.matchId) {
      const m = item.matches.find((x) => x.id === c.matchId); // must belong to this item
      if (!m) return NextResponse.json({ error: 'Unknown product for an item.' }, { status: 400 });
      price = m.price;
      plans.push({ itemId: item.id, approveId: m.id });
    } else {
      price = c.manual!.price;
      manualCount++;
      plans.push({ itemId: item.id, manual: { productName: c.manual!.productName, price, url: c.manual!.url ?? null } });
    }
    total += price * item.quantity;
  }
  total = round2(total);

  try {
    // SECURITY: interactive transaction so the "no donations yet" rule is checked atomically with the
    // writes. The Need row is locked first (capture-order locks the same row), so a donation cannot
    // slip in between the check and the update. Operations and their order are otherwise unchanged.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Need" WHERE id = ${need.id} FOR UPDATE`;
      if ((await tx.funding.count({ where: { needId: need.id } })) > 0) throw new AlreadyFunded();

      for (const p of plans) {
        await tx.productMatch.updateMany({ where: { itemId: p.itemId }, data: { approved: false } });
        if (p.approveId) {
          await tx.productMatch.update({ where: { id: p.approveId }, data: { approved: true } });
        } else {
          await tx.productMatch.create({
            data: {
              itemId: p.itemId,
              source: 'manual',
              manual: true,
              productName: p.manual!.productName,
              price: p.manual!.price,
              currency: need.region.currency,
              url: p.manual!.url,
              approved: true,
            },
          });
        }
      }
      await tx.need.update({ where: { id: need.id }, data: { target: total, status: 'OPEN' } });
      // Append-only: every approval is a new row.
      await tx.auditEvent.create({
        data: {
          needId: need.id,
          type: 'PRODUCTS_MATCHED',
          actor: auth.user.name,
          message: `Products approved: ${need.items.length - manualCount} from Channel3, ${manualCount} entered manually. Funding target ${total.toFixed(2)} ${need.region.currency}`,
        },
      });
    });
  } catch (e) {
    if (e instanceof AlreadyFunded) return NextResponse.json({ error: FUNDED_MSG }, { status: 409 });
    throw e;
  }

  return NextResponse.json({ ok: true, target: total });
}
