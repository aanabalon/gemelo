-- Solo ajustar la primary key de EnergyDerivedValue, sin Timescale aquí

ALTER TABLE "EnergyDerivedValue"
    DROP CONSTRAINT IF EXISTS "EnergyDerivedValue_pkey";

ALTER TABLE "EnergyDerivedValue"
    ADD PRIMARY KEY ("timestamp", "id");