import { prisma } from '@/lib/db';
import { adminGet, dayKey } from '@/lib/adminApi';
import { usdToNpr } from '@/lib/liveRate';

export const dynamic = 'force-dynamic';

// Read-only data for the Studio tab on the Analytics page: needs, donations and the live donations table. ADMIN only. Payer names are left out on purpose.
export const GET = () =>
  adminGet('studio', async () => {
    const [fx, needs, fundings] = await Promise.all([
      usdToNpr(),
      prisma.need.findMany({
        select: { id: true, title: true, location: true, families: true, urgency: true, status: true, target: true, raised: true, createdAt: true },
        take: 1000,
      }),
      prisma.funding.findMany({
        select: { id: true, needId: true, amount: true, currency: true, status: true, isSandbox: true, createdAt: true, need: { select: { title: true, location: true } } },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);
    // What each need received in the last 7 days, for the arrows in the needs table.
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const recent = new Map<string, number>();
    for (const f of fundings) {
      if (f.createdAt.getTime() >= since) recent.set(f.needId, (recent.get(f.needId) ?? 0) + f.amount);
    }
    return {
      // Newest donations first, for the live table. Payer names are left out. Rupees are an indicative display rate only.
      live: fundings.slice(0, 40).map((f) => ({
        id: f.id,
        at: f.createdAt.toISOString(),
        need: f.need.title,
        location: f.need.location,
        amountUsd: +f.amount.toFixed(2),
        amountNpr: Math.round(f.amount * fx.rate),
        status: f.status,
        mode: f.isSandbox ? 'Sandbox' : 'Live',
      })),
      needs: needs.map((n) => ({
        title: n.title,
        location: n.location,
        families: n.families,
        urgency: n.urgency,
        status: n.status,
        target: +n.target.toFixed(2),
        raised: +n.raised.toFixed(2),
        gap: +Math.max(0, n.target - n.raised).toFixed(2),
        fundedPct: n.target > 0 ? Math.min(100, Math.round((n.raised / n.target) * 100)) : 0,
        // 0 to 1, or null while the need has no price yet, so unpriced needs do not drag the gauge down.
        fundedRatio: n.target > 0 ? +Math.min(1, n.raised / n.target).toFixed(4) : null,
        raised7d: +(recent.get(n.id) ?? 0).toFixed(2),
        gapPerFamily: n.families > 0 ? +(Math.max(0, n.target - n.raised) / n.families).toFixed(2) : 0,
        raisedPerFamily: n.families > 0 ? +(n.raised / n.families).toFixed(2) : 0,
        priced: n.target > 0 ? 'Priced' : 'Not priced yet',
        created: dayKey(n.createdAt),
      })),
      donations: fundings.map((f) => ({
        date: dayKey(f.createdAt),
        amount: +f.amount.toFixed(2),
        currency: f.currency,
        status: f.status,
        sandbox: f.isSandbox ? 'Sandbox' : 'Live',
        size: f.amount < 50 ? 'Under $50' : f.amount < 200 ? '$50 to $199' : '$200 and over',
        need: f.need.title,
        location: f.need.location,
      })),
    };
  });
