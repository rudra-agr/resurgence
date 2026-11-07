import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { isValidId } from '@/lib/validate';
import { Refused, writeEvidence, type EvidenceType } from '@/lib/evidence';

export const dynamic = 'force-dynamic';

// Which task types produce public evidence. DISPATCH and VERIFICATION are internal steps.
const EVIDENCE_FOR: Record<string, EvidenceType | undefined> = {
  PURCHASE: 'PURCHASED',
  DELIVERY: 'DELIVERED',
};

const Body = z.object({ note: z.string().trim().max(300).optional() });

// Finishes a task. For PURCHASE and DELIVERY tasks the audit event and the DONE status are written
// in ONE transaction, so a task can never be DONE without its evidence (or the other way round).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  if (!isValidId(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const auth = await requireRole('ADMIN');
  if ('error' in auth) return auth.error;
  const limited = limit(`ops-complete:${auth.user.id}`, 30, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const note = parsed.data.note ?? '';

  try {
    await prisma.$transaction(async (tx) => {
      const task = await tx.deliveryTask.findUnique({ where: { id: params.id } });
      if (!task) throw new Refused('Task not found.', 404);
      if (task.status === 'DONE') throw new Refused('Task is already finished.', 409);
      if (task.status !== 'IN_PROGRESS') throw new Refused('Start the task (In progress) before finishing it.', 409);

      const evidence = EVIDENCE_FOR[task.type];
      if (evidence) {
        if (note.length < 5) throw new Refused('Add a short evidence note (5+ characters).', 400);
        await writeEvidence(tx, task.needId, evidence, note, auth.user.name);
      }
      await tx.deliveryTask.update({ where: { id: task.id }, data: { status: 'DONE' } });
    });
  } catch (e) {
    if (e instanceof Refused) return NextResponse.json({ error: e.reason }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
}