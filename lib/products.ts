import { prisma } from '@/lib/db';

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Read-only view of a need's items with every stored product match.
// "approved" is true only when every item has an approved match.
export async function loadProducts(needId: string) {
  const items = await prisma.item.findMany({
    where: { needId },
    orderBy: { id: 'asc' },
    include: { matches: { orderBy: { retrievedAt: 'asc' } } },
  });
  const total = round2(
    items.reduce((sum, i) => {
      const m = i.matches.find((x) => x.approved);
      return sum + (m ? m.price * i.quantity : 0);
    }, 0)
  );
  return {
    items,
    total,
    approved: items.length > 0 && items.every((i) => i.matches.some((m) => m.approved)),
  };
}
