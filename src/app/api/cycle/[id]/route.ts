import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const toIso = (value: Date | null | undefined) =>
  value ? value.toISOString() : null;

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id: rawId } = await context.params;
    if (!rawId) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }

    const numericId = Number(rawId);
    const where =
      Number.isNaN(numericId) || rawId.length > 15
        ? ({ id: rawId } as any)
        : ({ id: numericId } as any);

    const cycle = await prisma.cycle.findUnique({
      where,
      include: {
        points: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!cycle || !cycle.points || !cycle.points.length) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }

    const start = toIso(cycle.startReal);
    const end = toIso(cycle.endReal);
    const dischargeTime = toIso(cycle.dischargeTime);
    const durationHours =
      start && end
        ? (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 3600)
        : null;

    const points = cycle.points.map((point) => ({
      timestamp: toIso(point.timestamp)!,
      promedioSerpentin: point.avgSerpentin,
      promedioPuerta: point.avgDoor,
      operacion: point.operationState,
      energiaAcumulada: point.energyAccumulated,
    }));

    return NextResponse.json({
      id: cycle.id,
      start,
      end,
      endEstimated: toIso(cycle.endEstimated),
      durationHours,
      dischargeTime,
      energyAccumulatedTotal: cycle.energyAccumulatedTotal ?? 0,
      activeTimeMinutes: cycle.activeTimeMinutes,
      overfrozenTimeMinutes: cycle.overfrozenTimeMinutes,
      setPoint: cycle.setPoint,
      points,
    });
  } catch (error) {
    console.error('GET /api/cycle/[id] error', error);
    return NextResponse.json(
      { error: 'Failed to fetch cycle' },
      { status: 500 }
    );
  }
}
