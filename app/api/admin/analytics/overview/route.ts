import { prisma } from "@/lib/db";
import { adminGet } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

const FUNDED = ["FUNDED", "PURCHASED", "DELIVERED"];

export const GET = () =>
  adminGet("overview", async () => {
    const [needs, donations, region] = await Promise.all([
      prisma.need.findMany({ select: { status: true, families: true, target: true, raised: true } }),
      prisma.funding.aggregate({ where: { status: "CAPTURED" }, _count: { _all: true } }),
      prisma.region.findFirst({ select: { currency: true } }),
    ]);
    const totalTarget = needs.reduce((a, n) => a + n.target, 0);
    const totalRaised = needs.reduce((a, n) => a + n.raised, 0);
    // Completion counts each need only up to its own target, so one over-funded need cannot hide a gap.
    const covered = needs.reduce((a, n) => a + Math.min(n.raised, n.target), 0);
    return {
      currency: region?.currency ?? "USD",
      totalNeeds: needs.length,
      openNeeds: needs.filter((n) => !FUNDED.includes(n.status)).length,
      pricedNeeds: needs.filter((n) => n.target > 0).length,
      fundedNeeds: needs.filter((n) => FUNDED.includes(n.status)).length,
      totalFamilies: needs.reduce((a, n) => a + n.families, 0),
      totalRaised: +totalRaised.toFixed(2),
      totalTarget: +totalTarget.toFixed(2),
      fundingCompletionPct: totalTarget > 0 ? +((covered / totalTarget) * 100).toFixed(1) : 0,
      totalDonations: donations._count._all,
    };
  });
