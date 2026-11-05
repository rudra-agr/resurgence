import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";
import { URGENCY_ORDER } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export const GET = () =>
  adminGet("urgency", async () => {
    const rows = await prisma.need.groupBy({ by: ["urgency"], _count: { _all: true } });
    return rows
      .map((r) => ({ urgency: r.urgency, count: r._count._all }))
      .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));
  });
