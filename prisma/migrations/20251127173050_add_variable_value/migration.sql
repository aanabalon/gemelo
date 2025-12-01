-- CreateTable
CREATE TABLE "VariableValue" (
    "id" SERIAL NOT NULL,
    "variableId" TEXT NOT NULL,
    "variableName" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariableValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariableValue_variableId_idx" ON "VariableValue"("variableId");

-- CreateIndex
CREATE INDEX "VariableValue_variableName_idx" ON "VariableValue"("variableName");

-- CreateIndex
CREATE INDEX "VariableValue_timestamp_idx" ON "VariableValue"("timestamp");
