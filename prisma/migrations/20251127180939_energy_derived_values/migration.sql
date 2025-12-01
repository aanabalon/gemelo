-- AlterTable
ALTER TABLE "EnergyConfig" ADD COLUMN     "lastProcessedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EnergyDerivedValue" (
    "id" SERIAL NOT NULL,
    "configId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EnergyDerivedValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnergyDerivedValue_timestamp_idx" ON "EnergyDerivedValue"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "EnergyDerivedValue_configId_timestamp_key" ON "EnergyDerivedValue"("configId", "timestamp");

-- AddForeignKey
ALTER TABLE "EnergyDerivedValue" ADD CONSTRAINT "EnergyDerivedValue_configId_fkey" FOREIGN KEY ("configId") REFERENCES "EnergyConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
