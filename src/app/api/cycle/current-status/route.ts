import { NextResponse } from 'next/server';
import { ensureCyclesUpToDate } from '@/lib/cycles';
import { prisma } from '@/lib/prisma';
import { readCycleLogicConfig } from '@/lib/cycleLogicConfig';

export async function GET() {
    try {
        // 1. Ensure data is up to date
        await ensureCyclesUpToDate();

        // 2. Fetch current cycle
        let cycle = await prisma.cycle.findFirst({
            where: { isCurrent: true },
            include: { points: { orderBy: { timestamp: 'asc' } } },
        });

        if (!cycle) {
            cycle = await prisma.cycle.findFirst({
                orderBy: { startReal: 'desc' },
                include: { points: { orderBy: { timestamp: 'asc' } } },
            });
        }

        // If no cycle exists at all, return null
        if (!cycle) {
            return NextResponse.json({
                ok: true,
                cycle: null,
            });
        }

        // 3. Determine status
        let phase: 'idle' | 'running' | 'ready' = 'idle';
        let reachedSetpoint = false;
        let reachedSetpointAt: Date | null = null;
        let progress = 0;

        if (cycle.endReal) {
            // Cycle is complete
            phase = 'ready';
            reachedSetpoint = true;
            reachedSetpointAt = cycle.dischargeTime ?? cycle.endEstimated ?? cycle.endReal;
            progress = 100;
        } else {
            // Cycle is running
            phase = 'running';

            // Check setpoint
            const config = await readCycleLogicConfig();
            const setPoint = cycle.setPoint || config?.cycleEnergySetPoint || 0;

            if (setPoint > 0 && cycle.energyAccumulatedTotal >= setPoint) {
                phase = 'ready';
                reachedSetpoint = true;
                // Find when it happened in the points array
                if (cycle.points && cycle.points.length > 0) {
                    const hit = cycle.points.find(p => p.energyAccumulated >= setPoint);
                    if (hit) reachedSetpointAt = hit.timestamp;
                }
            }

            // Calculate progress (simplified based on energy)
            if (setPoint > 0) {
                progress = Math.min(100, (cycle.energyAccumulatedTotal / setPoint) * 100);
            }
        }

        return NextResponse.json({
            ok: true,
            cycle: {
                id: cycle.id,
                startReal: cycle.startReal,
                endReal: cycle.endReal,
                isCurrent: cycle.isCurrent,
                phase,
                reachedSetpoint,
                reachedSetpointAt,
                progress,
                energyAccumulatedTotal: cycle.energyAccumulatedTotal,
            },
        });

    } catch (error) {
        console.error('GET /api/cycle/current-status error', error);
        // Include error details in development
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            {
                error: 'Failed to fetch cycle status',
                details: process.env.NODE_ENV === 'development' ? details : undefined,
            },
            { status: 500 }
        );
    }
}
