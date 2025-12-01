import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { readCycleLogicConfig } from '@/lib/cycleLogicConfig';
import { processCycles, calculateWatermarkFromClosedCycles, updateCycleProcessingState } from '@/lib/cycles';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const config = await readCycleLogicConfig();
    const now = new Date();

    /**
     * Explicitly delete all existing data before recalculation as requested.
     * This ensures a clean slate for the new calculation.
     */
    console.log('[recalculate-cycles] Clearing existing data...');
    await prisma.cycle.deleteMany();
    await prisma.cycleProcessingState.deleteMany();

    /**
     * Recalculate complete history:
     * - processCycles with recalculate=true will delete ALL existing cycles and points
     * - Then rebuild all cycles (closed + open) from scratch
     */
    console.log('[recalculate-cycles] Starting full recalculation');
    await processCycles(new Date(0), now, true, config);

    /**
     * Update watermark to endReal of last CLOSED cycle.
     * This ensures that:
     * - Incremental jobs know where stable history ends
     * - The open cycle will always be recalculated completely
     */
    const newWatermark = await calculateWatermarkFromClosedCycles();
    await updateCycleProcessingState(newWatermark);

    console.log('[recalculate-cycles] Completed', {
      watermark: newWatermark?.toISOString() ?? 'null',
      explanation: newWatermark
        ? 'Set to endReal of last closed cycle'
        : 'No closed cycles yet (only open cycle)',
    });

    return NextResponse.json({
      ok: true,
      recalculated: true,
      watermark: newWatermark?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Error recalculando ciclos:', error);
    return NextResponse.json(
      {
        error: 'Error al recalcular ciclos',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
