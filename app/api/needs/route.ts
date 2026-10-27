import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Public, read-only ledger data.
export async function GET() {
  const [region, needs, fundings] = await Promise.all([
    prisma.region.findFirst(),
    prisma.need.findMany({
      orderBy: { createdAt: 'asc' },
      include: { items: true, coordinator: true, region: true },
    }),
    prisma.funding.findMany({
      orderBy: { createdAt: 'desc' },
      include: { need: { select: { title: true } } },
    }),
  ]);

  return NextResponse.json({
    region: region && { name: region.name, country: region.country, currency: region.currency },
    needs: needs.map((n) => ({
      id: n.id,
      title: n.title,
      location: n.location,
      families: n.families,
      urgency: n.urgency,
      status: n.status,
      coordinatorId: n.coordinatorId,
      verified: !!n.coordinator?.verified,
      authority: n.region.authorityLabel,
      raised: +n.raised.toFixed(2),
      target: +n.target.toFixed(2),
      items: n.items.map((i) => ({ name: i.name, qty: i.quantity })),
    })),
    donations: fundings.map((f) => ({
      id: f.id,
      needId: f.needId,
      needTitle: f.need.title,
      amount: f.amount,
      currency: f.currency,
      payer: f.payer,
      paypalOrderId: f.orderId,
      paypalCaptureId: f.captureId,
      createdAt: f.createdAt,
    })),
  });
}

const NeedBody = z.object({
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().max(160).default(''),
  families: z.coerce.number().int().min(0).max(1_000_000).default(0),
  urgency: z.enum(['Critical', 'High', 'Medium', 'Low']).default('High'),
  originalText: z.string().trim().max(2000).optional(),
  language: z.string().trim().max(40).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.number().int().min(1).max(100_000),
      })
    )
    .min(1, 'Add at least one item.')
    .max(20),
});

export async function POST(req: Request) {
  const auth = await requireRole('COORDINATOR', 'ADMIN');
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const parsed = NeedBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: `${i.path.join('.') || 'Request'}: ${i.message}` }, { status: 400 });
  }
  const b = parsed.data;

  // The coordinator comes from the logged-in session, never from the request body.
  const coord = user.coordinatorId
    ? await prisma.coordinator.findUnique({ where: { id: user.coordinatorId } })
    : null;
  if (!coord) {
    return NextResponse.json({ error: 'Only coordinator accounts can post needs.' }, { status: 403 });
  }

  const need = await prisma.need.create({
    data: {
      title: b.title,
      location: b.location,
      families: b.families,
      urgency: b.urgency,
      originalText: b.originalText || null,
      language: b.language || null,
      regionId: coord.regionId,
      coordinatorId: coord.id,
      items: { create: b.items },
      events: {
        create: {
          type: 'SUBMITTED',
          actor: coord.name,
          message: b.originalText
            ? 'Submitted from free text: AI-extracted, then reviewed and approved by the coordinator'
            : 'Submitted by the coordinator',
        },
      },
    },
  });

  return NextResponse.json({ id: need.id });
}
