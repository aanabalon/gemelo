-- CreateEnum
CREATE TYPE "Role" AS ENUM ('READER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'READER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" SERIAL NOT NULL,
    "tunnelId" TEXT NOT NULL DEFAULT 'tunnel-1',
    "startReal" TIMESTAMP(3) NOT NULL,
    "endReal" TIMESTAMP(3),
    "endEstimated" TIMESTAMP(3),
    "dischargeTime" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "energyAccumulatedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setPoint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSerpentinTotal" DOUBLE PRECISION,
    "avgDoorTotal" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CyclePoint" (
    "id" SERIAL NOT NULL,
    "cycleId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "avgSerpentin" DOUBLE PRECISION NOT NULL,
    "avgDoor" DOUBLE PRECISION NOT NULL,
    "operationState" INTEGER NOT NULL,
    "energyInstant" DOUBLE PRECISION NOT NULL,
    "energyAccumulated" DOUBLE PRECISION NOT NULL,
    "hourFromCycleStart" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CyclePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergyConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleLogicConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleLogicConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CyclePoint_cycleId_idx" ON "CyclePoint"("cycleId");

-- CreateIndex
CREATE INDEX "CyclePoint_timestamp_idx" ON "CyclePoint"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyConfig_name_key" ON "EnergyConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CycleLogicConfig_name_key" ON "CycleLogicConfig"("name");

-- AddForeignKey
ALTER TABLE "CyclePoint" ADD CONSTRAINT "CyclePoint_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
