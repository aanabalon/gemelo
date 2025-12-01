import { recomputeDerivedValues } from '@/lib/derivedValues';
import { MIN_REAL_CONFIG_NAME } from '@/lib/energy/constants';
import { prisma } from '@/lib/prisma';

const INTERVAL_MS = Number(process.env.DERIVED_VALUE_POLL_INTERVAL_MS ?? 60000);

let started = false;

async function runPoll() {
  try {
    const configs = await prisma.energyConfig.findMany({
      where: { enabled: true },
    });

    const orderedConfigs = [...configs].sort((a, b) => {
      if (a.name === MIN_REAL_CONFIG_NAME) return -1;
      if (b.name === MIN_REAL_CONFIG_NAME) return 1;
      return 0;
    });

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
