import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { limit, MIN } from '@/lib/rateLimit';
import { READY_STATUSES, READY_TYPE, UPDATE_TYPE, type CoordinatorData } from '@/lib/coordinator';

export const dynamic = 'force-dynamic';

// COORDINATOR only. Everything the coordinator dashboard shows, read from real records.
export async function GET() {
  const auth = await requireRole('COORDINATOR');
  if ('error' in auth) return auth.error;
  const limited = limit(`coord-read:${auth.user.id}`, 60, MIN);
  if (limited) return limited;
  if (!auth.user.coordinatorId) return NextResponse.json({ error: 'No coordinator profile on this account.' }, { status: 403 });

  const coordinator = await prisma.coordinator.findUnique({
    where: { id: auth.user.coordinatorId },
    include: { region: { select: { name: true } } },
  });
  if (!coordinator) return NextResponse.json({ error: 'Coordinator profile not found.' }, { status: 404 });

  const needs = await prisma.need.findMany({
    where: { coordinatorId: coordinator.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      events: { orderBy: { createdAt: 'desc' }, take: 100 },
      tasks: {
        where: { status: { not: 'DONE' } },
        orderBy: { startDate: 'asc' },
        take: 1,
        include: { resource: { select: { name: true } } },
      },
    },
  });

  const activity = needs
    .flatMap((n) => n.events.map((e) => ({ ...e, needTitle: n.title })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 200);

  const body: CoordinatorData = {
    coordinator: { name: auth.user.name, region: coordinator.region.name },
    stats: {
      needs: needs.length,
      raised: +needs.reduce((a, n) => a + n.raised, 0).toFixed(2),
      families: needs.reduce((a, n) => a + n.families, 0),
    },
    needs: needs.map((n) => {
      const has = (t: string) => n.events.some((e) => e.type === t);
      const lastUpdate = n.events.find((e) => e.type === UPDATE_TYPE);
      const t = n.tasks[0];
      const readyMarked = has(READY_TYPE);
      return {
        id: n.id,
        title: n.title,
        location: n.location,
        status: n.status,
        urgency: n.urgency,
        families: n.families,
        raised: +n.raised.toFixed(2),
        target: +n.target.toFixed(2),
        createdAt: n.createdAt.toISOString(),
        lastEventAt: n.events[0]?.createdAt.toISOString() ?? null,
        lastUpdate: lastUpdate ? { message: lastUpdate.message, createdAt: lastUpdate.createdAt.toISOString() } : null,
        readyMarked,
        canMarkReady: !readyMarked && n.target > 0 && READY_STATUSES.includes(n.status) && !has('PURCHASED') && !has('DELIVERED'),
        nextTask: t ? { type: t.type, title: t.title, startDate: t.startDate.toISOString(), resource: t.resource?.name ?? null } : null,
      };
    }),
    activity: activity.map((e) => ({
      id: e.id,
      needId: e.needId,
      needTitle: e.needTitle,
      type: e.type,
      actor: e.actor,
      message: e.message,
      isSimulated: e.isSimulated,
      createdAt: e.createdAt.toISOString(),
    })),
  };
  return NextResponse.json(body);
}
