import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidId } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // SECURITY: reject malformed ids before they reach the database.
  if (!isValidId(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const events = await prisma.auditEvent.findMany({
    where: { needId: params.id },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(events);
}
