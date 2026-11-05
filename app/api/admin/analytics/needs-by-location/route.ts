import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export const GET = () =>
  adminGet("location", async () => {
    const rows = await prisma.need.groupBy({
      by: ["location"],
      _count: { _all: true },
      _sum: { families: true, raised: true },
    });
    return rows
      .map((r) => ({
        location: r.location || "Unspecified",
        count: r._count._all,
        families: r._sum.families ?? 0,
        raised: +(r._sum.raised ?? 0).toFixed(2),
      }))
      .sort((a, b) => b.families - a.families);
  });
