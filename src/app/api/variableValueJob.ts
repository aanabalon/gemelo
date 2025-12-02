import { fetchRawData } from '../../lib/influx';
import { evaluateFormula } from '../../lib/formulas';
import { MIN_REAL_CONFIG_NAME } from '@/lib/energy/constants';
import { prisma } from '@/lib/prisma';

const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const JOB_INTERVAL_MS = 60 * 1000; // 1 minuto

type EnergyVariable = {
  id: string;
  name: string;
  expression: string;
};

async function processVariable(variable: EnergyVariable, from: Date, to: Date) {
  const rows = await fetchRawData(from, to);
  if (!rows || rows.length === 0) return 0;

  const values = rows.map((row) => ({
    variableId: variable.id,
    variableName: variable.name,
    timestamp: row.timestamp,
    value: evaluateFormula(variable.expression, row),
  }));

  const existing = await prisma.variableValue.findMany({
    where: {
      variableId: variable.id,
      timestamp: { in: values.map(v => v.timestamp) },
    },
    select: { timestamp: true },
  });
  const existingSet = new Set(existing.map((e) => new Date(e.timestamp).getTime()));
  const toInsert = values.filter(v => !existingSet.has(new Date(v.timestamp).getTime()));

  if (toInsert.length > 0) {
    await prisma.variableValue.createMany({ data: toInsert });
  }
  return toInsert.length;
}

export async function variableValueJob(lookbackMs = DEFAULT_LOOKBACK_MS) {
  const now = new Date();
  const lookback = new Date(now.getTime() - lookbackMs);

  const variables = await prisma.energyConfig.findMany({
    where: {
      enabled: true,
      name: { not: MIN_REAL_CONFIG_NAME },
    },
  }) as EnergyVariable[];
  for (const variable of variables) {
    const last = await prisma.variableValue.findFirst({
      where: { variableId: variable.id },
      orderBy: { timestamp: 'desc' },
    });
    let from = last ? new Date(last.timestamp.getTime() + 60000) : lookback;
    const to = now;
    if (last && (now.getTime() - last.timestamp.getTime() > lookbackMs)) {
      from = lookback;
    }
    const count = await processVariable(variable, from, to);
    console.log(`Variable ${variable.name}: ${count} nuevos valores calculados (${from.toISOString()} - ${to.toISOString()})`);
  }
}

if (!(globalThis as { __variableValueJobInterval?: NodeJS.Timeout }).__variableValueJobInterval) {
  (globalThis as { __variableValueJobInterval?: NodeJS.Timeout }).__variableValueJobInterval = setInterval(() => {
    variableValueJob().catch(console.error);
  }, JOB_INTERVAL_MS);
}
