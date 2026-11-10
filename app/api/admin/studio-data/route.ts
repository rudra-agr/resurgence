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
        select: { title: true, location: true, families: true, urgency: true, status: true, target: true, raised: true, createdAt: true },
        take: 1000,
      }),
      prisma.funding.findMany({
        select: { id: true, amount: true, currency: true, status: true, isSandbox: true, createdAt: true, need: { select: { title: true, location: true } } },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);
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
