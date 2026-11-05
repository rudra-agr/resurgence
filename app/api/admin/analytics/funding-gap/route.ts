import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export const GET = () =>
  adminGet("gap", async () => {
    const needs = await prisma.need.findMany({
      where: { target: { gt: 0 } }, // unpriced needs have no gap to measure yet
      select: { id: true, title: true, families: true, target: true, raised: true },
      take: 500,
    });
    return needs
      .map((n) => ({
        needId: n.id,
        title: n.title,
        families: n.families,
        target: +n.target.toFixed(2),
        raised: +n.raised.toFixed(2),
        gap: +Math.max(0, n.target - n.raised).toFixed(2),
      }))
      .sort((a, b) => b.gap - a.gap);
  });
