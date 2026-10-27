import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, canManage } from '@/lib/auth';
import { searchProducts } from '@/lib/channel3';
import { loadProducts } from '@/lib/products';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

// Public and read-only: shows stored matches. It never searches or writes anything.
export async function GET(_req: Request, { params }: Ctx) {
  const need = await prisma.need.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!need) return NextResponse.json({ error: 'Need not found.' }, { status: 404 });
  return NextResponse.json(await loadProducts(params.id));
}

// Coordinator action: run a live Channel3 search and store candidates for review.
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireRole('COORDINATOR', 'ADMIN');
  if ('error' in auth) return auth.error;

  const need = await prisma.need.findUnique({
    where: { id: params.id },
    include: { items: true, region: true, fundings: { select: { id: true }, take: 1 } },
  });
  if (!need) return NextResponse.json({ error: 'Need not found.' }, { status: 404 });
  if (!canManage(auth.user, need)) return NextResponse.json({ error: 'Not your need.' }, { status: 403 });
  // Prices cannot change once money has been collected against them.
  if (need.fundings.length) {
    return NextResponse.json({ error: 'This need already has donations, so products are locked.' }, { status: 409 });
  }

  const failed: string[] = [];
  for (const item of need.items) {
    try {
      const found = await searchProducts(item.name);
      // Only keep prices in the region's currency so totals are never mixed.
      // (A result with no currency is assumed to be in the region currency.)
      const usable = found.filter((c) => !c.currency || c.currency === need.region.currency);
      // Replace old suggestions, but keep approved and manual rows.
      await prisma.$transaction([
        prisma.productMatch.deleteMany({ where: { itemId: item.id, approved: false, manual: false } }),
        prisma.productMatch.createMany({
          data: usable.map((c) => ({
            itemId: item.id,
            source: c.retailer,
            productName: c.title,
            price: c.price,
            currency: need.region.currency,
            url: c.url,
          })),
        }),
      ]);
    } catch (e) {
      console.error('[channel3]', item.name, e instanceof Error ? e.message : e);
      failed.push(item.name); // the screen shows "No match available" with a manual option
    }
  }

  return NextResponse.json({ ...(await loadProducts(params.id)), failed });
}
