import { NextResponse } from 'next/server';
import { ensureCyclesUpToDate } from '@/lib/cycles';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Ensure cycles are up to date
        await ensureCyclesUpToDate();

        // Fetch current cycle
        const cycle = await prisma.cycle.findFirst({
            where: { isCurrent: true },
            include: {
                points: {
                    orderBy: { timestamp: 'asc' }
                }
            },
        });

        if (!cycle) {
            // Fallback: try to find the last closed cycle
            const lastClosed = await prisma.cycle.findFirst({
                orderBy: { endReal: 'desc' },
                include: {
                    points: {
                        orderBy: { timestamp: 'asc' }
                    }
                }
            });

            if (!lastClosed) {
                return NextResponse.json({
                    ok: true,
                    cycle: null,
                    message: 'No current or closed cycle found',
                });
            }

            // Return the last closed cycle, but we can mark it as closed if needed
            // The frontend might expect 'isCurrent' to be true for the "current" view,
            // but strictly speaking it's not current. 
            // However, the user asked to "tomar el último ciclo cerrado".
            return NextResponse.json({
                ok: true,
                cycle: {
                    id: lastClosed.id,
                    tunnelId: lastClosed.tunnelId,
                    startReal: lastClosed.startReal,
                    endReal: lastClosed.endReal,
                    endEstimated: lastClosed.endEstimated,
                    dischargeTime: lastClosed.dischargeTime,
                    isCurrent: lastClosed.isCurrent, // likely false
                    energyAccumulatedTotal: lastClosed.energyAccumulatedTotal,
                    setPoint: lastClosed.setPoint,
                    activeTimeMinutes: lastClosed.activeTimeMinutes,
                    overfrozenTimeMinutes: lastClosed.overfrozenTimeMinutes,
                    pointsCount: lastClosed.points.length,
                    firstPoint: lastClosed.points[0] ? {
                        timestamp: lastClosed.points[0].timestamp,
                        avgSerpentin: lastClosed.points[0].avgSerpentin,
                        avgDoor: lastClosed.points[0].avgDoor,
                        operationState: lastClosed.points[0].operationState,
                    } : null,
                    lastPoint: lastClosed.points[lastClosed.points.length - 1] ? {
                        timestamp: lastClosed.points[lastClosed.points.length - 1].timestamp,
                        avgSerpentin: lastClosed.points[lastClosed.points.length - 1].avgSerpentin,
                        avgDoor: lastClosed.points[lastClosed.points.length - 1].avgDoor,
                        operationState: lastClosed.points[lastClosed.points.length - 1].operationState,
                    } : null,
                },
                message: 'Returned last closed cycle (no open cycle found)',
            });
        }

        // Calculate display index
        const countBefore = await prisma.cycle.count({
            where: { startReal: { lt: cycle.startReal } }
        });
        const displayIndex = countBefore + 1;

        return NextResponse.json({
            ok: true,
            cycle: {
                id: cycle.id,
                displayIndex,
                tunnelId: cycle.tunnelId,
                startReal: cycle.startReal,
                endReal: cycle.endReal,
                endEstimated: cycle.endEstimated,
                dischargeTime: cycle.dischargeTime,
                isCurrent: cycle.isCurrent,
                energyAccumulatedTotal: cycle.energyAccumulatedTotal,
                setPoint: cycle.setPoint,
                activeTimeMinutes: cycle.activeTimeMinutes,
                overfrozenTimeMinutes: cycle.overfrozenTimeMinutes,
                pointsCount: cycle.points.length,
                firstPoint: cycle.points[0] ? {
                    timestamp: cycle.points[0].timestamp,
                    avgSerpentin: cycle.points[0].avgSerpentin,
                    avgDoor: cycle.points[0].avgDoor,
                    operationState: cycle.points[0].operationState,
                } : null,
                lastPoint: cycle.points[cycle.points.length - 1] ? {
                    timestamp: cycle.points[cycle.points.length - 1].timestamp,
                    avgSerpentin: cycle.points[cycle.points.length - 1].avgSerpentin,
                    avgDoor: cycle.points[cycle.points.length - 1].avgDoor,
                    operationState: cycle.points[cycle.points.length - 1].operationState,
                } : null,
            },
        });

    } catch (error) {
        console.error('GET /api/cycle/debug-current error', error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            {
                error: 'Failed to fetch debug cycle',
                details: process.env.NODE_ENV === 'development' ? details : undefined,
            },
            { status: 500 }
        );
    }
}
