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
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return NextResponse.json({ error: 'Invalid cycle id' }, { status: 400 });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: numericId },
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
    const endReal = toIso(cycle.endReal);
    const dischargeTime = toIso(cycle.dischargeTime);
    const endEstimated = toIso(cycle.endEstimated);
    const sobrecongelamientoHoras =
      endReal && endEstimated
        ? Math.max(
            (new Date(endReal).getTime() - new Date(endEstimated).getTime()) / (1000 * 3600),
            0,
          )
        : null;
    const duracionCicloHoras =
      !cycle.isCurrent && start && dischargeTime
        ? Math.max(
            (new Date(dischargeTime).getTime() - new Date(start).getTime()) / (1000 * 3600),
            0,
          )
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
      end: endReal,
      endReal,
      endEstimated,
      dischargeTime,
      duracionCicloHoras,
      sobrecongelamientoHoras,
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
