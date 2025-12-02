import { recomputeDerivedValues } from '@/lib/derivedValues';
import { MIN_REAL_CONFIG_NAME } from '@/lib/energy/constants';
import { sortConfigsByDependency } from '@/lib/energy/dependencySort';
import { prisma } from '@/lib/prisma';

const INTERVAL_MS = Number(process.env.DERIVED_VALUE_POLL_INTERVAL_MS ?? 60000);

async function runPoll() {
  try {
    const configs = await prisma.energyConfig.findMany({
      where: { enabled: true },
    });

    console.log('[DerivedValuePoller] run', {
      enabledConfigs: configs.length,
      intervalMs: INTERVAL_MS,
    });

    const orderedConfigs = sortConfigsByDependency(configs);

    for (const config of orderedConfigs) {
      try {
        await recomputeDerivedValues(config, { allConfigs: configs });
      } catch (error) {
        console.error(
          `Error recalculando valores derivados para ${config.name}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error('No se pudieron recuperar las configuraciones de energía:', error);
  }
}

const globalForPoller = globalThis as unknown as {
  derivedValuePollerStarted: boolean | undefined;
};

export function startDerivedValuePoller() {
  if (globalForPoller.derivedValuePollerStarted) return;
  globalForPoller.derivedValuePollerStarted = true;

  console.log('[DerivedValuePoller] Starting poller...');
  runPoll().catch((error) => console.error('Poll inicial falló:', error));
  setInterval(() => {
    runPoll().catch((error) => console.error('Poll programado falló:', error));
  }, INTERVAL_MS);
}
