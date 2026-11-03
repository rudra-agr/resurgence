import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password';

const db = new PrismaClient();

// All sample data is fictional. Swap it freely.
const needs = [
  { title: 'Emergency shelter', location: 'Camp A', families: 40, urgency: 'Critical',
    items: [{ name: 'tarpaulin sheet', quantity: 40 }, { name: 'sleeping bag', quantity: 40 }] },
  { title: 'Safe drinking water', location: 'Village B', families: 60, urgency: 'Critical',
    items: [{ name: 'portable water filter', quantity: 30 }, { name: 'water purification tablets', quantity: 60 }] },
  { title: 'Warm blankets', location: 'Village C', families: 80, urgency: 'High',
    items: [{ name: 'wool blanket', quantity: 80 }] },
  { title: 'First aid kits', location: 'Camp A', families: 25, urgency: 'High',
    items: [{ name: 'first aid kit', quantity: 25 }] },
  { title: 'Infant care supplies', location: 'Village D', families: 30, urgency: 'Medium',
    items: [{ name: 'infant formula', quantity: 60 }, { name: 'diapers pack', quantity: 120 }] },
];

async function main() {
  // SECURITY: never seed demo accounts into production by accident. Opt in on the command line:
  //   ALLOW_PROD_SEED=yes npx prisma db seed   (do not put this in any env file)
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'yes') {
    throw new Error('Refusing to seed in production. Pass ALLOW_PROD_SEED=yes on the command line to override.');
  }
  const adminPw = process.env.SEED_ADMIN_PASSWORD;
  const coordPw = process.env.SEED_COORDINATOR_PASSWORD;
  if (!adminPw || !coordPw || adminPw.length < 12 || coordPw.length < 12) {
    throw new Error('Set SEED_ADMIN_PASSWORD and SEED_COORDINATOR_PASSWORD (12+ characters) in your environment');
  }

  // Safe to run again: each piece is created only if missing.
  const region =
    (await db.region.findFirst()) ??
    (await db.region.create({
      data: { name: 'Demo Region', country: 'Demo Country', currency: 'USD', languages: ['en'], authorityLabel: 'Local Authority' },
    }));

  const coord =
    (await db.coordinator.findFirst()) ??
    (await db.coordinator.create({ data: { name: 'Demo Coordinator', verified: true, regionId: region.id } }));

  await db.user.upsert({
    where: { email: 'admin@resurgence.demo' },
    update: { passwordHash: await hashPassword(adminPw) },
    create: { email: 'admin@resurgence.demo', name: 'Demo Admin', role: 'ADMIN', passwordHash: await hashPassword(adminPw) },
  });
  await db.user.upsert({
    where: { email: 'coordinator@resurgence.demo' },
    update: { passwordHash: await hashPassword(coordPw), coordinatorId: coord.id },
    create: { email: 'coordinator@resurgence.demo', name: coord.name, role: 'COORDINATOR', coordinatorId: coord.id, passwordHash: await hashPassword(coordPw) },
  });

  if (!(await db.need.count())) {
    for (const n of needs) {
      await db.need.create({
        data: {
          title: n.title, location: n.location, families: n.families, urgency: n.urgency,
          regionId: region.id, coordinatorId: coord.id,
          items: { create: n.items },
          events: { create: { type: 'SUBMITTED', actor: coord.name, message: 'Need submitted (sample data)', isSimulated: true } },
        },
      });
    }
  }
  console.log('Seeded. Logins: admin@resurgence.demo and coordinator@resurgence.demo');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
