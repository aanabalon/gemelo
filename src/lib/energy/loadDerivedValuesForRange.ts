import { EnergyConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type DerivedValuesByTimestamp = Record<string, Record<string, number>>;

function mapValuesByTimestamp(
  values: Array<{
    timestamp: Date;
    value: number;
    config: { name: string };
  }>
): DerivedValuesByTimestamp {
  const byTs: DerivedValuesByTimestamp = {};

  for (const value of values) {
    const key = value.timestamp.toISOString();
    if (!byTs[key]) {
      byTs[key] = {};
    }
    byTs[key][value.config.name] = value.value;
  }

  return byTs;
}

export async function loadDerivedValuesForRange(
  configs: EnergyConfig[],
  start: Date,
  end: Date
): Promise<DerivedValuesByTimestamp> {
  if (!configs.length) return {};

  const values = await prisma.energyDerivedValue.findMany({
    where: {
      configId: { in: configs.map((c) => c.id) },
      timestamp: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { timestamp: 'asc' },
    include: { config: true },
  });

  return mapValuesByTimestamp(values);
}

export async function loadDerivedValuesByNames(
  names: string[],
  start: Date,
  end: Date
): Promise<DerivedValuesByTimestamp> {
  if (!names.length) return {};

  const values = await prisma.energyDerivedValue.findMany({
    where: {
      config: {
        name: { in: names },
      },
      timestamp: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { timestamp: 'asc' },
    include: { config: true },
  });

  return mapValuesByTimestamp(values);
}
