import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { adminGet } from '@/lib/adminApi';
import { assertSameOrigin, requireJson } from '@/lib/csrf';
import { limit, MIN } from '@/lib/rateLimit';
import { RESOURCE_TYPES } from '@/lib/operations';

export const dynamic = 'force-dynamic';

// ADMIN only. Lists the vehicles, teams and warehouses that deliveries can be assigned to.
export const GET = () =>
  adminGet('ops-resources', async () => ({
    resources: await prisma.resource.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }], take: 200 }),
  }));

const Body = z.object({
  name: z.string().trim().min(2, 'Name needs 2+ characters.').max(80),
  type: z.enum(RESOURCE_TYPES),
  capacity: z.number().int().min(1).max(1000).default(1),
  region: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req) ?? requireJson(req);
  if (blocked) return blocked;
  const auth = await requireRole('ADMIN');
  if ('error' in auth) return auth.error;
  const limited = limit(`ops-resource:${auth.user.id}`, 30, MIN);
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { name, type, capacity, region } = parsed.data;

  if ((await prisma.resource.count()) >= 200) {
    return NextResponse.json({ error: 'Resource limit reached.' }, { status: 409 });
  }
  const resource = await prisma.resource.create({ data: { name, type, capacity, region: region || null } });
  return NextResponse.json({ ok: true, resource }, { status: 201 });
}
