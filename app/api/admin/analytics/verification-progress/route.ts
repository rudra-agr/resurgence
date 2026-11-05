import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

// Counts of audit events by type: what has actually been recorded, not what is assumed.
export const GET = () =>
  adminGet("verification", async () => {
    const rows = await prisma.auditEvent.groupBy({ by: ["type"], _count: { _all: true } });
    return rows.map((r) => ({ type: r.type, count: r._count._all })).sort((a, b) => b.count - a.count);
  });
