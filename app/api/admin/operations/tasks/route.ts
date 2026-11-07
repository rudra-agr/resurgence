import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { adminGet } from '@/lib/adminApi';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { isValidId } from '@/lib/validate';
import { isoDate, TASK_TYPES } from '@/lib/operations';

export const dynamic = 'force-dynamic';

const idField = z.string().refine(isValidId, 'Invalid id.');

// ADMIN only. All scheduled tasks with the need they belong to.
export const GET = () =>
  adminGet('ops-tasks', async () => ({
    tasks: await prisma.deliveryTask.findMany({
      orderBy: { startDate: 'asc' },
      take: 500,
      include: { need: { select: { title: true, location: true, status: true } } },
    }),
  }));

const Create = z.object({
  title: z.string().trim().min(2, 'Title needs 2+ characters.').max(120),
  needId: idField,
  resourceId: idField.nullable().optional(),
  type: z.enum(TASK_TYPES),
  startDate: isoDate,
  endDate: isoDate,
  notes: z.string().trim().max(300).optional(),
});

// Fields a drag, resize or edit may change. DONE is NOT allowed here: finishing a PURCHASE or
// DELIVERY task has to write evidence, and that is a separate step so there is one way in.
const Patch = z.object({
  id: idField,
  title: z.string().trim().min(2).max(120).optional(),
  resourceId: idField.nullable().optional(),
  type: z.enum(TASK_TYPES).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS']).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

const Remove = z.object({ id: idField });

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

async function guard(req: Request) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return { error: blocked };
  const auth = await requireRole('ADMIN');
  if ('error' in auth) return { error: auth.error };
  const limited = limit(`ops-task:${auth.user.id}`, 120, MIN);
  if (limited) return { error: limited };
  return { user: auth.user };
}

async function resourceProblem(resourceId: string): Promise<string | null> {
  const r = await prisma.resource.findUnique({ where: { id: resourceId }, select: { active: true } });
  if (!r) return 'Resource not found.';
  if (!r.active) return 'That resource is not active.';
  return null;
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0].message, 400);
  const d = parsed.data;
  if (d.endDate <= d.startDate) return fail('End must be after start.', 400);

  if (!(await prisma.need.findUnique({ where: { id: d.needId }, select: { id: true } }))) {
    return fail('Need not found.', 404);
  }
  if (d.resourceId) {
    const problem = await resourceProblem(d.resourceId);
    if (problem) return fail(problem, 400);
  }
  const task = await prisma.deliveryTask.create({
    data: {
      title: d.title,
      needId: d.needId,
      resourceId: d.resourceId ?? null,
      type: d.type,
      startDate: d.startDate,
      endDate: d.endDate,
      notes: d.notes || null,
    },
  });
  return NextResponse.json({ ok: true, task }, { status: 201 });
}

export async function PATCH(req: Request) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0].message, 400);
  const { id, ...changes } = parsed.data;

  const existing = await prisma.deliveryTask.findUnique({ where: { id } });
  if (!existing) return fail('Task not found.', 404);
  if (existing.status === 'DONE') return fail('A finished task cannot be changed.', 409);

  const start = changes.startDate ?? existing.startDate;
  const end = changes.endDate ?? existing.endDate;
  if (end <= start) return fail('End must be after start.', 400);

  if (changes.resourceId) {
    const problem = await resourceProblem(changes.resourceId);
    if (problem) return fail(problem, 400);
  }
  // Build the update from only the fields that were sent, so nothing else is overwritten.
  const task = await prisma.deliveryTask.update({
    where: { id },
    data: {
      ...(changes.title !== undefined && { title: changes.title }),
      ...(changes.resourceId !== undefined && { resourceId: changes.resourceId }),
      ...(changes.type !== undefined && { type: changes.type }),
      ...(changes.status !== undefined && { status: changes.status }),
      ...(changes.startDate !== undefined && { startDate: changes.startDate }),
      ...(changes.endDate !== undefined && { endDate: changes.endDate }),
      ...(changes.notes !== undefined && { notes: changes.notes || null }),
    },
  });
  return NextResponse.json({ ok: true, task });
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const parsed = Remove.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0].message, 400);

  const existing = await prisma.deliveryTask.findUnique({ where: { id: parsed.data.id }, select: { status: true } });
  if (!existing) return fail('Task not found.', 404);
  if (existing.status === 'DONE') return fail('A finished task cannot be deleted.', 409);
  await prisma.deliveryTask.delete({ where: { id: parsed.data.id } });
  return NextResponse.json({ ok: true });
}
