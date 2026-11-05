-- CreateTable
CREATE TABLE "DisasterEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "triggerType" TEXT NOT NULL,
    "glacierName" TEXT,
    "collapseAreaKm2" DOUBLE PRECISION,
    "waveHeightM" DOUBLE PRECISION,
    "affectedRivers" TEXT[],
    "districtsPrimary" TEXT[],
    "districtsOther" TEXT[],
    "priorRainfallReported" BOOLEAN NOT NULL DEFAULT false,
    "previousGLOF" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisasterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasualtySnapshot" (
    "id" TEXT NOT NULL,
    "disasterEventId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "bodiesRecovered" INTEGER,
    "missing" INTEGER,
    "rescued" INTEGER,
    "injured" INTEGER,
    "source" TEXT NOT NULL,

    CONSTRAINT "CasualtySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingDamage" (
    "id" TEXT NOT NULL,
    "disasterEventId" TEXT NOT NULL,
    "settlement" TEXT NOT NULL,
    "totalAssessed" INTEGER NOT NULL,
    "affected" INTEGER NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "BuildingDamage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CasualtySnapshot_disasterEventId_idx" ON "CasualtySnapshot"("disasterEventId");

-- CreateIndex
CREATE INDEX "BuildingDamage_disasterEventId_idx" ON "BuildingDamage"("disasterEventId");

-- AddForeignKey
ALTER TABLE "CasualtySnapshot" ADD CONSTRAINT "CasualtySnapshot_disasterEventId_fkey" FOREIGN KEY ("disasterEventId") REFERENCES "DisasterEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingDamage" ADD CONSTRAINT "BuildingDamage_disasterEventId_fkey" FOREIGN KEY ("disasterEventId") REFERENCES "DisasterEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
