-- Compression + retention policies for EnergyDerivedValue
ALTER TABLE "EnergyDerivedValue" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'configId'
);

-- Automatically compress chunks older than 7 days
SELECT
  add_compression_policy('EnergyDerivedValue', INTERVAL '7 days');

-- Optionally purge chunks older than 180 days
SELECT
  add_retention_policy('EnergyDerivedValue', INTERVAL '180 days');
