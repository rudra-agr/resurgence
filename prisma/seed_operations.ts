import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// SAMPLE resources for the delivery scheduler. These are placeholders for the demo, not real
// vehicles or teams. Safe to run again: a resource is only created if its name is missing.
const SAMPLE = [
  { name: 'Vehicle 1 (sample)', type: 'VEHICLE', capacity: 1 },
  { name: 'Vehicle 2 (sample)', type: 'VEHICLE', capacity: 1 },
  { name: 'Field team A (sample)', type: 'TEAM', capacity: 4 },
  { name: 'Field team B (sample)', type: 'TEAM', capacity: 4 },
  { name: 'Warehouse hub (sample)', type: 'WAREHOUSE', capacity: 10 },
];

async function main() {
  const region = await db.region.findFirst({ select: { name: true } });
  let created = 0;
  for (const r of SAMPLE) {
    if (await db.resource.findFirst({ where: { name: r.name } })) continue;
    await db.resource.create({ data: { ...r, region: region?.name ?? null } });
    created++;
  }
  console.log(`Operations resources: ${created} created, ${SAMPLE.length - created} already existed.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
