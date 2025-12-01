-- Seed internal EnergyConfig entry for the system min_real variable
INSERT INTO "EnergyConfig" ("id", "name", "expression", "description", "enabled", "createdAt", "updatedAt")
SELECT
  '00000000-0000-0000-0000-00000000a001' AS id,
  'min_real' AS name,
  'min_real' AS expression,
  'Intervalo real (minutos) entre mediciones consecutivas provenientes de InfluxDB' AS description,
  TRUE AS enabled,
  NOW() AS createdAt,
  NOW() AS updatedAt
WHERE NOT EXISTS (
  SELECT 1 FROM "EnergyConfig" WHERE "name" = 'min_real'
);
