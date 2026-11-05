import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// Figures come from resurgence-agstudio-bryntum-spec.json. Safe to run again: skips if the event exists.
async function main() {
  const name = 'Rasuwa GLOF 2026';
  if (await db.disasterEvent.findFirst({ where: { name } })) {
    console.log('Disaster event already seeded.');
    return;
  }
  await db.disasterEvent.create({
    data: {
      name,
      date: new Date('2026-08-26T08:40:00+05:45'),
      triggerType: 'GLOF',
      glacierName: 'Lhende Khola watershed',
      collapseAreaKm2: 1.0,
      waveHeightM: 9.0,
      affectedRivers: ['Lhende Khola', 'Bhote Koshi', 'Trishuli', 'Narayani'],
      districtsPrimary: ['Rasuwa'],
      districtsOther: ['Nuwakot', 'Dhading', 'Gorkha'],
      priorRainfallReported: false,
      previousGLOF: '2025-07-08',
      casualtySnapshots: {
        create: [
          { snapshotDate: new Date('2026-08-29'), bodiesRecovered: 626, missing: 2400, rescued: 4450, injured: null, source: 'Nepal MoFA' },
          { snapshotDate: new Date('2026-09-10'), bodiesRecovered: 1377, missing: 5130, rescued: 13656, injured: null, source: 'Nepal MoFA' },
          { snapshotDate: new Date('2026-09-20'), bodiesRecovered: 1451, missing: 5786, rescued: null, injured: 10178, source: 'Nepal MoFA' },
        ],
      },
      buildingDamage: {
        create: [
          { settlement: 'Syabrubesi', totalAssessed: 559, affected: 433, source: 'Copernicus EMS' },
          { settlement: 'Timure', totalAssessed: 441, affected: 431, source: 'Copernicus EMS' },
        ],
      },
    },
  });
  console.log('Seeded disaster event, 3 casualty snapshots, 2 settlements.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
