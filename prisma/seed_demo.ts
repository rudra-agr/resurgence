import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysAgo = (d: number, hour = 11) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(hour, (d * 7) % 60, 0, 0);
  return t;
};

type Item = { name: string; quantity: number; unit?: string; price?: number };
type Gift = { amount: number; daysAgo: number; payer: string };
type Plan = { title: string; location: string; families: number; urgency: string; items: Item[]; gifts: Gift[] };

const SAMPLE_DONORS = ['Anita B.', 'Prakash D.', 'Laxmi G.', 'Suman T.', 'Kabita M.', 'Dipesh K.', 'Rita S.', 'Naresh L.', 'Binod A.', 'Gita R.', 'Mohan P.', 'Sarita N.'];

const PLANS: Plan[] = [
  {
    title: 'Rice, lentils and cooking oil', location: 'Bidur', families: 200, urgency: 'Critical',
    items: [
      { name: 'rice, 25 kg sack', quantity: 200, price: 17 },
      { name: 'lentils, 5 kg', quantity: 200, price: 6.5 },
      { name: 'cooking oil, 5 L', quantity: 200, price: 9 },
    ],
    gifts: [
      { amount: 2500, daysAgo: 12, payer: 'Himalayan Trekkers Club' }, { amount: 1500, daysAgo: 9, payer: 'Anita B.' },
      { amount: 1000, daysAgo: 6, payer: 'Maya T.' }, { amount: 800, daysAgo: 4, payer: 'Aarav S.' }, { amount: 700, daysAgo: 2, payer: 'Prakash D.' },
    ],
  },
  {
    title: 'Cooking fuel and stoves', location: 'Syabrubesi', families: 70, urgency: 'High',
    items: [{ name: 'portable gas stove', quantity: 70, price: 18 }, { name: 'LPG cylinder, filled', quantity: 70, price: 22 }],
    gifts: [
      { amount: 1200, daysAgo: 11, payer: 'Kathmandu Rotary Friends' }, { amount: 800, daysAgo: 6, payer: 'Laxmi G.' },
      { amount: 300, daysAgo: 3, payer: 'Sita K.' }, { amount: 150, daysAgo: 1, payer: 'Suman T.' },
    ],
  },
  {
    title: 'Winter clothing for children', location: 'Thuman', families: 55, urgency: 'High',
    items: [{ name: "children's padded jacket", quantity: 110, price: 14 }, { name: 'woollen cap', quantity: 110, price: 3 }],
    gifts: [{ amount: 500, daysAgo: 8, payer: 'Pokhara Students Group' }, { amount: 250, daysAgo: 5, payer: 'Kabita M.' }, { amount: 140, daysAgo: 2, payer: 'Bikash R.' }],
  },
  {
    title: 'Hygiene and sanitation kits', location: 'Dhunche', families: 120, urgency: 'High',
    items: [{ name: 'family hygiene kit', quantity: 120, price: 6.5 }, { name: 'sanitary pad pack', quantity: 120, price: 2.2 }],
    gifts: [
      { amount: 200, daysAgo: 10, payer: 'Dipesh K.' }, { amount: 150, daysAgo: 7, payer: 'Nisha P.' }, { amount: 95, daysAgo: 5, payer: 'Rita S.' },
      { amount: 60, daysAgo: 3, payer: 'Rajan G.' }, { amount: 25, daysAgo: 1, payer: 'Naresh L.' },
    ],
  },
  {
    title: 'Mobile health camp supplies', location: 'Dhunche', families: 95, urgency: 'Medium',
    items: [{ name: 'oral rehydration salts', quantity: 400, price: 0.3 }, { name: 'basic medicine kit', quantity: 20, price: 45 }],
    gifts: [{ amount: 520, daysAgo: 13, payer: 'Valley Health Volunteers' }, { amount: 500, daysAgo: 7, payer: 'Binod A.' }],
  },
  {
    title: 'School-in-a-box learning kits', location: 'Timure', families: 90, urgency: 'Medium',
    items: [{ name: 'school-in-a-box kit', quantity: 150, price: 11 }],
    gifts: [{ amount: 100, daysAgo: 4, payer: 'Gita R.' }, { amount: 50, daysAgo: 1, payer: 'Sunita L.' }],
  },
  {
    title: 'Solar lanterns', location: 'Gatlang', families: 150, urgency: 'Low',
    items: [{ name: 'solar lantern with phone charger', quantity: 150, price: 9 }],
    gifts: [],
  },
  {
    // No prices on purpose, so the pipeline still shows a need that has not reached "Priced".
    title: 'Latrine repair materials', location: 'Timure', families: 45, urgency: 'High',
    items: [{ name: 'cement bag', quantity: 40 }, { name: 'corrugated roofing sheet', quantity: 60 }],
    gifts: [],
  },
];

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'yes') {
    throw new Error('Refusing to seed in production. Pass ALLOW_PROD_SEED=yes on the command line to override.');
  }

  const first = await db.region.findFirst();
  if (!first) throw new Error('No region yet. Run `npx prisma db seed` first.');

  const region = await db.region.update({
    where: { id: first.id },
    data: { name: 'Rasuwa District', country: 'Nepal', languages: ['en', 'ne'], authorityLabel: 'District Administration Office' },
  });

  const rename: Record<string, string> = { 'Camp A': 'Syabrubesi', 'Village B': 'Timure', 'Village C': 'Thuman', 'Village D': 'Dhunche' };
  for (const [from, to] of Object.entries(rename)) await db.need.updateMany({ where: { location: from }, data: { location: to } });
  await db.resource.updateMany({ where: { region: first.name }, data: { region: region.name } });

  const unnamed = await db.funding.findMany({ where: { orderId: { startsWith: 'DEMO-' }, payer: 'Anonymous' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  for (const [i, f] of unnamed.entries()) await db.funding.update({ where: { id: f.id }, data: { payer: SAMPLE_DONORS[i % SAMPLE_DONORS.length] } });

  const coord = await db.coordinator.findFirst();
  let needsAdded = 0, giftsAdded = 0;

  for (const p of PLANS) {
    if (await db.need.findFirst({ where: { title: p.title, location: p.location } })) continue;

    const priced = p.items.every((i) => i.price != null);
    const target = priced ? round2(p.items.reduce((s, i) => s + i.quantity * (i.price as number), 0)) : 0;
    const raised = round2(p.gifts.reduce((s, g) => s + g.amount, 0));
    if (raised > target + 0.005) throw new Error(`Sample donations for "${p.title}" are more than its target.`);

    const need = await db.need.create({
      data: {
        title: p.title, location: p.location, families: p.families, urgency: p.urgency,
        target, raised, status: target > 0 && raised >= target - 0.005 ? 'FUNDED' : 'OPEN',
        regionId: region.id, coordinatorId: coord?.id ?? null, createdAt: daysAgo(15),
        items: { create: p.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit ?? null })) },
      },
      include: { items: true },
    });
    needsAdded++;

    const actor = coord?.name ?? 'Demo Coordinator';
    await db.auditEvent.create({ data: { needId: need.id, type: 'SUBMITTED', actor, message: 'Need submitted (sample data)', isSimulated: true, createdAt: daysAgo(15) } });

    if (priced) {
      for (const item of need.items) {
        const src = p.items.find((i) => i.name === item.name)!;
        await db.productMatch.create({
          data: { itemId: item.id, source: 'Manual', manual: true, approved: true, productName: item.name, price: src.price as number, currency: region.currency },
        });
      }
      await db.auditEvent.create({
        data: { needId: need.id, type: 'PRODUCTS_MATCHED', actor, isSimulated: true, createdAt: daysAgo(14),
          message: `Products approved: 0 from Channel3, ${need.items.length} entered manually. Funding target ${target.toFixed(2)} ${region.currency} (sample data)` },
      });
    }

    let running = 0;
    for (const [n, g] of [...p.gifts].sort((a, b) => b.daysAgo - a.daysAgo).entries()) {
      const key = `DEMO-${need.id.slice(-8)}-${n + 1}`;
      running = round2(running + g.amount);
      await db.funding.create({
        data: { orderId: `${key}-ORD`, captureId: `${key}-CAP`, amount: g.amount, currency: region.currency, payer: g.payer, status: 'CAPTURED', isSandbox: true, needId: need.id, createdAt: daysAgo(g.daysAgo, 9 + n * 2) },
      });
      const full = running >= target - 0.005;
      await db.auditEvent.create({
        data: { needId: need.id, type: full ? 'FUNDED' : 'PARTIALLY_FUNDED', actor: 'PayPal sandbox', isSimulated: true, createdAt: daysAgo(g.daysAgo, 9 + n * 2),
          message: `Sample donation of ${g.amount.toFixed(2)} ${region.currency}. Total ${running.toFixed(2)} of ${target.toFixed(2)} (sample data)` },
      });
      giftsAdded++;
    }
  }

  console.log(`Region is now ${region.name}, ${region.country}. Added ${needsAdded} needs and ${giftsAdded} sample donations.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
