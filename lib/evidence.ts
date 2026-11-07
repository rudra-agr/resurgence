import type { Prisma } from '@prisma/client';

// One place that writes PURCHASED / DELIVERED audit events. Used by BOTH the admin evidence route
// and the operations "complete task" route, so there is only one way to create this evidence.
export class Refused extends Error {
  constructor(public reason: string, public status: number) {
    super(reason);
  }
}

export type EvidenceType = 'PURCHASED' | 'DELIVERED';

// Call inside prisma.$transaction. Throws Refused when the rules are not met.
export async function writeEvidence(
  tx: Prisma.TransactionClient,
  needId: string,
  type: EvidenceType,
  note: string,
  actor: string
): Promise<void> {
  const label = type === 'PURCHASED' ? 'Purchase' : 'Delivery';
  await tx.$queryRaw`SELECT id FROM "Need" WHERE id = ${needId} FOR UPDATE`;
  const need = await tx.need.findUnique({ where: { id: needId }, select: { status: true } });
  if (!need) throw new Refused('Need not found.', 404);
  if (need.status !== 'FUNDED') throw new Refused('Purchase can only be recorded after the need is fully funded.', 409);
  const prior = await tx.auditEvent.findMany({
    where: { needId, type: { in: ['PURCHASED', 'DELIVERED'] } },
    select: { type: true },
  });
  const done = (t: string) => prior.some((e) => e.type === t);
  if (done(type)) throw new Refused(`${label} is already recorded.`, 409);
  if (type === 'DELIVERED' && !done('PURCHASED')) throw new Refused('Record the purchase before delivery.', 409);
  await tx.auditEvent.create({
    data: {
      needId,
      type,
      actor,
      message: `${label} recorded by admin as TEST evidence. Note: ${note}`,
      isSimulated: true,
    },
  });
}
