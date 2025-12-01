-- Continuous aggregate aggregating energy per hour/config
CREATE MATERIALIZED VIEW energy_accum_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', "timestamp") AS bucket,
  "configId",
  SUM("value") AS energy_sum
FROM "EnergyDerivedValue"
GROUP BY bucket, "configId";

-- Refresh policy to keep the aggregate warm
SELECT add_continuous_aggregate_policy(
  'energy_accum_1h',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes'
);
