import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { canManage, requireRole } from '@/lib/auth';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { isValidId } from '@/lib/validate';
import { MAX_UPDATES_PER_NEED, UPDATE_TYPE } from '@/lib/coordinator';

export const dynamic = 'force-dynamic';

const Body = z.object({
  message: z.string().trim().min(10, 'Write at least 10 characters.').max(500, 'Keep it under 500 characters.'),
});

// A coordinator posts a situation update on one of THEIR needs. It becomes a public timeline event.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  if (!isValidId(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const auth = await requireRole('COORDINATOR');
  if ('error' in auth) return auth.error;
  const limited = limit(`coord-update:${auth.user.id}`, 20, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const need = await prisma.need.findUnique({ where: { id: params.id }, select: { id: true, coordinatorId: true } });
  if (!need) return NextResponse.json({ error: 'Need not found.' }, { status: 404 });
  // Same message for "not yours" so ids of other coordinators' needs are not confirmed.
  if (!canManage(auth.user, need)) return NextResponse.json({ error: 'Need not found.' }, { status: 404 });

  const count = await prisma.auditEvent.count({ where: { needId: need.id, type: UPDATE_TYPE } });
  if (count >= MAX_UPDATES_PER_NEED) {
    return NextResponse.json({ error: `This need already has ${MAX_UPDATES_PER_NEED} updates.` }, { status: 409 });
  }
  await prisma.auditEvent.create({
    data: { needId: need.id, type: UPDATE_TYPE, actor: auth.user.name, message: parsed.data.message, isSimulated: false },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
