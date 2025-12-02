import { ensureCyclesUpToDate } from '@/lib/cycles';

const INTERVAL_MS = Number(process.env.CYCLE_PROCESS_POLL_INTERVAL_MS ?? 5 * 60 * 1000); // default 5 min

const globalForPoller = globalThis as unknown as {
  cycleProcessingPollerStarted?: boolean;
};

export function startCycleProcessingPoller() {
  if (globalForPoller.cycleProcessingPollerStarted) return;
  globalForPoller.cycleProcessingPollerStarted = true;

  const runOnce = async () => {
    try {
      const result = await ensureCyclesUpToDate();
      console.info('[CycleProcessingPoller] run', {
        from: result?.processedFrom.toISOString(),
        to: result?.processedTo.toISOString(),
        descargas: result?.descargasCount ?? 0,
        cycles: result?.cyclesCreated ?? 0,
        closed: result?.closedCycles ?? 0,
        open: result?.openCycles ?? 0,
        watermark: result?.watermark ?? null,
      });
    } catch (error) {
      console.error('[CycleProcessingPoller] ensureCyclesUpToDate failed', error);
    }
  };

  // Initial run
  runOnce();

  // Scheduled runs
  setInterval(() => {
    runOnce();
  }, INTERVAL_MS);
}
