import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

// Audit events by type: how many events were recorded, and for how many different needs.
// The pipeline uses "needs" so one need with two events is not counted twice.
export const GET = () =>
  adminGet("verification", async () => {
    const rows = await prisma.auditEvent.groupBy({ by: ["type", "needId"], _count: { _all: true } });
    const byType = new Map<string, { count: number; needs: number }>();
    for (const r of rows) {
      const cur = byType.get(r.type) ?? { count: 0, needs: 0 };
      byType.set(r.type, { count: cur.count + r._count._all, needs: cur.needs + 1 });
    }
    return [...byType.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.count - a.count);
  });
