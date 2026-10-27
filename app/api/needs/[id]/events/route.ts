import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const events = await prisma.auditEvent.findMany({
    where: { needId: params.id },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(events);
}
