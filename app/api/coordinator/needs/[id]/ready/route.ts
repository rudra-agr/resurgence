import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { canManage, requireRole } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { isValidId } from '@/lib/validate';
import { READY_STATUSES, READY_TYPE } from '@/lib/coordinator';

export const dynamic = 'force-dynamic';

// The coordinator confirms the situation on the ground. This ONLY adds a timeline event.
// It never changes the need's status: that stays with the admin.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  if (!isValidId(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const auth = await requireRole('COORDINATOR');
  if ('error' in auth) return auth.error;
  const limited = limit(`coord-ready:${auth.user.id}`, 20, MIN);
  if (limited) return limited;

  const need = await prisma.need.findUnique({
    where: { id: params.id },
    select: { id: true, coordinatorId: true, status: true, target: true },
  });
  if (!need || !canManage(auth.user, need)) return NextResponse.json({ error: 'Need not found.' }, { status: 404 });
  if (!(need.target > 0) || !READY_STATUSES.includes(need.status)) {
    return NextResponse.json({ error: 'Products must be approved and priced before a need can be marked ready.' }, { status: 409 });
  }
  const prior = await prisma.auditEvent.findMany({
    where: { needId: need.id, type: { in: [READY_TYPE, 'PURCHASED', 'DELIVERED'] } },
    select: { type: true },
  });
  if (prior.some((e) => e.type === READY_TYPE)) return NextResponse.json({ error: 'Already marked ready.' }, { status: 409 });
  if (prior.length) return NextResponse.json({ error: 'This need has already been purchased.' }, { status: 409 });

  await prisma.auditEvent.create({
    data: {
      needId: need.id,
      type: READY_TYPE,
      actor: auth.user.name,
      message: 'Coordinator confirmed situation on the ground. Ready for dispatch.',
      isSimulated: false,
    },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
