import { prisma } from "@/lib/db";
import { adminGet, dayKey } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export const GET = () =>
  adminGet("donations", async () => {
    const rows = await prisma.funding.findMany({
      where: { status: "CAPTURED" },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    const byDay = new Map<string, { amount: number; count: number }>();
    for (const r of rows) {
      const k = dayKey(r.createdAt);
      const cur = byDay.get(k) ?? { amount: 0, count: 0 };
      byDay.set(k, { amount: cur.amount + r.amount, count: cur.count + 1 });
    }
    return [...byDay.entries()].map(([date, v]) => ({ date, amount: +v.amount.toFixed(2), count: v.count }));
  });
