import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export const GET = () =>
  adminGet("status", async () => {
    const rows = await prisma.need.groupBy({ by: ["status"], _count: { _all: true } });
    return rows.map((r) => ({ status: r.status, count: r._count._all })).sort((a, b) => b.count - a.count);
  });
