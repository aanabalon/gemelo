import { Prisma, EnergyConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { fetchRawData, MappedDataPoint } from './influx';
import { MIN_REAL_CONFIG_NAME } from './energy/constants';
import { loadDerivedValuesForRange, DerivedValuesByTimestamp } from './energy/loadDerivedValuesForRange';
import { evaluateFormula } from './formulas';

interface DerivedOptions {
  start?: Date;
  end?: Date;
  fromScratch?: boolean;
  allConfigs?: EnergyConfig[];
}

const CHUNK_SIZE = 400;
const INITIAL_START_DATE = new Date('2025-10-30T00:00:00.000Z');

function buildContext(
  point: MappedDataPoint,
  derivedForTimestamp: Record<string, number> = {},
  currentConfigName?: string
) {
  const derived: Record<string, number> = {};
  for (const key of Object.keys(derivedForTimestamp)) {
    if (key === currentConfigName) continue;
    derived[key] = derivedForTimestamp[key];
  }
  return { ...point, ...derived };
}

function annotateWithMinReal(points: MappedDataPoint[]) {
  if (!points.length) return [];
  const ordered = [...points].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  let previousTimestamp: number | null = null;

  return ordered.map((point) => {
    const deltaMinutes =
      previousTimestamp === null
        ? 0
        : Math.max(
          (point.timestamp.getTime() - previousTimestamp) / 60000,
          0
        );

    previousTimestamp = point.timestamp.getTime();

    if (typeof point.min_real === 'number') {
      return point;
    }

    return {
      ...point,
      min_real: Number.isFinite(deltaMinutes) ? deltaMinutes : 0,
    };
  });
}

export async function purgeDerivedValues(configId: string) {
  await prisma.energyDerivedValue.deleteMany({
    where: { configId },
  });

  await prisma.energyConfig.update({
    where: { id: configId },
    data: { lastProcessedAt: null },
  });
}

export async function recomputeDerivedValues(config: EnergyConfig, options: DerivedOptions = {}) {
  if (!config.expression || !config.enabled) {
    return;
  }

  if (options.fromScratch) {
    await purgeDerivedValues(config.id);
  }

  const recordedLast = config.lastProcessedAt ?? null;
  const fallbackStart = recordedLast ?? new Date(0);
  const startFrom =
    options.start ?? (recordedLast === null ? INITIAL_START_DATE : fallbackStart);
  const endDate = options.end ?? new Date();

  if (startFrom >= endDate) {
    await prisma.energyConfig.update({
      where: { id: config.id },
      data: { lastProcessedAt: endDate },
    });
    return;
  }

  const rawData = await fetchRawData(startFrom, endDate);
  if (!rawData.length) {
    await prisma.energyConfig.update({
      where: { id: config.id },
      data: { lastProcessedAt: endDate },
    });
    return;
  }

  const annotatedPoints = annotateWithMinReal(rawData);
  if (!annotatedPoints.length) {
    await prisma.energyConfig.update({
      where: { id: config.id },
      data: { lastProcessedAt: endDate },
    });
    return;
  }

  const allConfigs = options.allConfigs ?? (await prisma.energyConfig.findMany());

  let derivedValuesByTimestamp: DerivedValuesByTimestamp = await loadDerivedValuesForRange(
    allConfigs,
    startFrom,
    endDate
  );

  const isMinRealConfig = config.name === MIN_REAL_CONFIG_NAME;

  const values = annotatedPoints.map((point) => {
    const timestampKey = point.timestamp.toISOString();
    const derivedForTimestamp = derivedValuesByTimestamp[timestampKey] ?? {};
    const context = buildContext(point, derivedForTimestamp, config.name);

    const evaluated = isMinRealConfig
      ? Number(point.min_real ?? 0)
      : Number(evaluateFormula(config.expression, context) ?? 0);

    return {
      configId: config.id,
      timestamp: point.timestamp,
      value: Number.isFinite(evaluated) ? evaluated : 0,
    };
  });

  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE);
    if (!chunk.length) continue;

    const valuesSql = Prisma.join(
      chunk.map((v) =>
        Prisma.sql`(${Prisma.sql`${v.configId}`}::text, ${v.timestamp}::timestamptz, ${v.value}::double precision)`
      )
    );

    // Use UPSERT so recalculations overwrite existing historical points without duplicates.
    await prisma.$executeRaw`
      INSERT INTO "EnergyDerivedValue" ("configId", "timestamp", "value")
      VALUES ${valuesSql}
      ON CONFLICT ("configId", "timestamp")
      DO UPDATE SET "value" = EXCLUDED."value";
    `;
    for (const entry of chunk) {
      const key = entry.timestamp.toISOString();
      derivedValuesByTimestamp[key] ??= {};
      derivedValuesByTimestamp[key][config.name] = entry.value;
    }
  }

  await prisma.energyConfig.update({
    where: { id: config.id },
    data: { lastProcessedAt: endDate },
  });
}
