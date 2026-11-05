

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  await db.reliefContribution.deleteMany();
  await db.fundSnapshot.deleteMany();

  await db.reliefContribution.createMany({ data: [
    { contributor: 'Jensen Huang (CEO, NVIDIA)', type: 'Individual', scope: 'international', amountLabel: 'USD 10 Million', nprMillion: 1520, nprArba: 1.52 },
    { contributor: 'World Bank',                 type: 'Pledge',     scope: 'international', amountLabel: 'रू 25 Arba',     nprMillion: 25000, nprArba: 25 },
    { contributor: 'IFRC / International Red Cross', type: 'Pledge', scope: 'international', amountLabel: 'CHF 25 Million', nprMillion: 3100,  nprArba: 3.1 },
    { contributor: 'GlobalGiving Nepal Flood Relief', type: 'NGO',   scope: 'international', amountLabel: 'USD 2.84 Million', nprMillion: 432,  nprArba: 0.43 },
    { contributor: 'Canada',                     type: 'State Aid',  scope: 'international', amountLabel: 'CAD 2 Million',  nprMillion: 170,   nprArba: 0.17 },
    { contributor: 'Bangladesh',                 type: 'State Aid',  scope: 'international', amountLabel: 'USD 1 Million',  nprMillion: 152,   nprArba: 0.15 },
    { contributor: 'Bhutan',                     type: 'State Aid',  scope: 'international', amountLabel: '₹100 Million',  nprMillion: 145,   nprArba: 0.14 },
    { contributor: 'Maldivian Red Crescent',     type: 'NGO',        scope: 'international', amountLabel: 'In-kind + funds', nprMillion: 50,  nprArba: 0.05 },
  ]});

  await db.reliefContribution.createMany({ data: [
    { contributor: 'Public citizens (QR crowdfunding)', type: 'Digital giving', scope: 'national', amountLabel: 'रू 1.96 Arba',    nprMillion: 1960, nprArba: 1.96, notes: '800,000+ individual transactions' },
    { contributor: 'Gorkha Brewery',                    type: 'Corporate',      scope: 'national', amountLabel: 'रू 100 Million',   nprMillion: 100 },
    { contributor: 'InDrive Nepal',                     type: 'Corporate',      scope: 'national', amountLabel: 'रू 75 Million',    nprMillion: 75,  notes: 'Plus direct aid to Nuwakot/Bidur' },
    { contributor: 'Nepal Netrajyoti Sangh',            type: 'Individual',     scope: 'national', amountLabel: 'रू 14.1 Million',  nprMillion: 14.1 },
    { contributor: 'Nepal Bank Limited',                type: 'Banking',        scope: 'national', amountLabel: 'रू 30.1 Million',  nprMillion: 30.1 },
    { contributor: 'Kumari Bank Limited',               type: 'Banking',        scope: 'national', amountLabel: 'रू 30 Million',    nprMillion: 30 },
    { contributor: 'Rastriya Banijya Bank',             type: 'Banking',        scope: 'national', amountLabel: 'रू 30 Million',    nprMillion: 30 },
    { contributor: 'Nepal Infrastructure Bank (NIFRA)', type: 'Banking',        scope: 'national', amountLabel: 'रू 25 Million',    nprMillion: 25 },
    { contributor: 'NIC Asia Bank',                     type: 'Banking',        scope: 'national', amountLabel: 'रू 22.1 Million',  nprMillion: 22.1 },
    { contributor: 'Saras Beverage (Red Bull)',         type: 'Corporate',      scope: 'national', amountLabel: 'रू 20 Million',    nprMillion: 20 },
    { contributor: 'Ncell Axiata',                      type: 'Telecom',        scope: 'national', amountLabel: 'रू 10 Million',    nprMillion: 10 },
    { contributor: 'Garment Association of Nepal',      type: 'Trade body',     scope: 'national', amountLabel: 'रू 3.33 Million',  nprMillion: 3.33, notes: 'Plus essential clothing supplies' },
    { contributor: 'Mobile Phone Importers Assoc.',     type: 'Trade body',     scope: 'national', amountLabel: 'रू 3.1 Million',   nprMillion: 3.1 },
    { contributor: 'Imperial Securities',               type: 'Capital markets',scope: 'national', amountLabel: 'रू 2.4 Million',   nprMillion: 2.4 },
    { contributor: 'Muktinath Climate Care',            type: 'Green finance',  scope: 'national', amountLabel: 'रू 0.6 Million',   nprMillion: 0.6 },
  ]});

  await db.fundSnapshot.createMany({ data: [
    { daysAfterEvent: 1,  nprBillion: 0.8  },
    { daysAfterEvent: 2,  nprBillion: 1.91 },
    { daysAfterEvent: 3,  nprBillion: 2.4  },
    { daysAfterEvent: 5,  nprBillion: 4.2  },
    { daysAfterEvent: 7,  nprBillion: 6.1  },
    { daysAfterEvent: 10, nprBillion: 8.5  },
    { daysAfterEvent: 14, nprBillion: 11.95},
    { daysAfterEvent: 21, nprBillion: 12.8 },
    { daysAfterEvent: 30, nprBillion: 14.2 },
  ]});

  console.log('✓ Relief seed complete');
}

main().finally(() => db.$disconnect());
