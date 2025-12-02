import path from 'path';
import { register } from 'tsconfig-paths';

register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: {
    '@/*': ['src/*'],
  },
});

import { prisma } from '../src/lib/prisma';
import { recomputeDerivedValues as recomputeDerivedValuesForConfig } from '../src/lib/derivedValues';
import { processCycles, resetCycleProcessingState } from '../src/lib/cycles';

async function resetAndRebuild() {
  const start = new Date('2025-10-29T00:00:00.000Z');
  const end = new Date();

  console.log('[Reset] Starting cleanup...');

  console.log('[Reset] Deleting EnergyDerivedValue records...');
  await prisma.energyDerivedValue.deleteMany();

  console.log('[Reset] Deleting CyclePoint records...');
  await prisma.cyclePoint.deleteMany();

  console.log('[Reset] Deleting Cycle records...');
  await prisma.cycle.deleteMany();

  console.log('[Reset] Deleting CycleProcessingState records...');
  await resetCycleProcessingState();

  console.log('[Rebuild] Recomputing derived values from %s to %s', start.toISOString(), end.toISOString());
  await recomputeAllDerivedValues(start, end);
  console.log('[Rebuild] Derived values recomputed.');

  console.log('[Rebuild] Processing cycles from %s to %s', start.toISOString(), end.toISOString());
  await processCycles(start, end, true);
  console.log('[Rebuild] Cycle processing completed.');
}

async function recomputeAllDerivedValues(start: Date, end: Date) {
  const configs = await prisma.energyConfig.findMany({ where: { enabled: true } });
  console.log('[Derived] Found %d enabled configs.', configs.length);

  for (const config of configs) {
    console.log('[Derived] Recomputing %s...', config.name);
    await recomputeDerivedValuesForConfig(config, {
      fromScratch: true,
      start,
      end,
      allConfigs: configs,
    }).catch(error => {
      console.error('[Derived] Failed to recompute %s:', config.name, error);
      throw error;
    });
  }
}

resetAndRebuild()
  .then(() => {
    console.log('[Reset] Completed successfully.');
  })
  .catch(error => {
    console.error('[Reset] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
