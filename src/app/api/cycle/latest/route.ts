import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureCyclesUpToDate } from '@/lib/cycles';

export const dynamic = 'force-dynamic';

function serializeCycle(cycle: any) {
  const start = cycle.startReal ? new Date(cycle.startReal).toISOString() : null;
  const end = cycle.endReal ? new Date(cycle.endReal).toISOString() : null;
  const dischargeTime = cycle.dischargeTime ? new Date(cycle.dischargeTime).toISOString() : null;
  const endEstimated = cycle.endEstimated ? new Date(cycle.endEstimated).toISOString() : null;
  const durationHours =
    start && end
      ? (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 3600)
      : null;

  return {
    id: cycle.id,
    start,
    end,
    endEstimated,
    durationHours,
    dischargeTime,
    isCurrent: cycle.isCurrent ?? false,
    energyAccumulatedTotal: cycle.energyAccumulatedTotal ?? 0,
    activeTimeMinutes: cycle.activeTimeMinutes ?? null,
    overfrozenTimeMinutes: cycle.overfrozenTimeMinutes ?? null,
    setPoint: cycle.setPoint ?? null,
    points: (cycle.points || []).map((point: any) => {
      let ts: string | null = null;
      try {
        if (point && point.timestamp) ts = new Date(point.timestamp).toISOString();
      } catch (e) {
        // keep ts null
      }
      return {
        timestamp: ts,
        avgSerpentin: point?.avgSerpentin ?? null,
        avgDoor: point?.avgDoor ?? null,
        operationState: point?.operationState ?? null,
        energyAccumulated: point?.energyAccumulated ?? null,
      };
    }),
  };
}

export async function GET() {
  try {
    // Ensure cycles are up to date. Non-fatal: if processing fails, log and continue
    try {
      await ensureCyclesUpToDate();
    } catch (err) {
      console.error('GET /api/cycle/latest: ensureCyclesUpToDate failed, continuing with existing data', err);
    }

    // Try to find current cycle first, then latest
    let cycle = await prisma.cycle.findFirst({
      where: { isCurrent: true },
      orderBy: { startReal: 'desc' },
      include: { points: { orderBy: { timestamp: 'asc' } } },
    });

    if (!cycle) {
      cycle = await prisma.cycle.findFirst({
        orderBy: { startReal: 'desc' },
        include: { points: { orderBy: { timestamp: 'asc' } } },
      });
    }

    // Return 200 with null if no cycles exist
    if (!cycle) {
      return NextResponse.json({ ok: true, cycle: null });
    }

    // Calculate display index (1-based)
    const countBefore = await prisma.cycle.count({
      where: { startReal: { lt: cycle.startReal } }
    });
    const displayIndex = countBefore + 1;

    try {
      const serialized = serializeCycle(cycle);
      return NextResponse.json({ ok: true, cycle: { ...serialized, displayIndex } });
    } catch (err) {
      console.error('GET /api/cycle/latest: serialization failed, returning null cycle', err);
      // Don't fail the whole endpoint if serialization has issues; return null cycle
      return NextResponse.json({ ok: true, cycle: null });
    }
  } catch (error) {
    console.error('GET /api/cycle/latest error', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest cycle' },
      { status: 500 }
    );
  }
}
