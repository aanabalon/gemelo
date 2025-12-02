-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificationEventType" AS ENUM ('CYCLE_STARTED', 'SETPOINT_REACHED', 'CYCLE_COMPLETED', 'SETPOINT_PERCENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "tunnelId" TEXT NOT NULL DEFAULT 'tunnel-1',
    "event" "NotificationEventType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recipients" TEXT[],
    "percentageThreshold" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "cycleId" INTEGER,
    "tunnelId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "event" "NotificationEventType" NOT NULL,
    "percentageThreshold" DOUBLE PRECISION,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationRule_event_tunnelId_key" ON "NotificationRule"("event", "tunnelId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_ruleId_tunnelId_cycleStart_key" ON "NotificationLog"("ruleId", "tunnelId", "cycleStart");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "NotificationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
