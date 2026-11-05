import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

// Returns null when no event has been seeded; the dashboard then hides the disaster section.
export const GET = () =>
  adminGet("disaster", () =>
    prisma.disasterEvent.findFirst({
      orderBy: { date: "desc" },
      include: {
        casualtySnapshots: { orderBy: { snapshotDate: "asc" } },
        buildingDamage: { orderBy: { affected: "desc" } },
      },
    })
  );
