import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const cycleIdParam = url.searchParams.get('cycleId');

        let cycle;
        if (cycleIdParam) {
            const id = Number(cycleIdParam);
            cycle = await prisma.cycle.findUnique({ where: { id } });
        } else {
            // Try current cycle first, else last finished
            cycle = await prisma.cycle.findFirst({ where: { isCurrent: true }, orderBy: { id: 'desc' } });
            if (!cycle) {
                cycle = await prisma.cycle.findFirst({ orderBy: { id: 'desc' } });
            }
        }

        if (!cycle) return NextResponse.json({ error: 'No cycle found' }, { status: 404 });

        const points = await prisma.cyclePoint.findMany({ where: { cycleId: cycle.id }, orderBy: { timestamp: 'asc' } });

        // Compute active time (hours) by summing intervals where operationState==1
        let activeMs = 0;
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const cur = points[i];
            const dt = cur.timestamp.getTime() - prev.timestamp.getTime();
            if (prev.operationState === 1) activeMs += dt;
        }
        const activeHours = activeMs / (1000 * 3600);

        // Recompute averages if not present
        const avgSerpentin = cycle.avgSerpentinTotal ?? (points.length > 0 ? points.reduce((s, p) => s + p.avgSerpentin, 0) / points.length : 0);
        const avgDoor = cycle.avgDoorTotal ?? (points.length > 0 ? points.reduce((s, p) => s + p.avgDoor, 0) / points.length : 0);

        // Projection using last hour slope
        let projectedEnd: Date | null = cycle.endEstimated ?? null;
        if ((!projectedEnd || cycle.isCurrent) && points.length > 1) {
            const lastPoint = points[points.length - 1];
            const oneHourAgo = new Date(lastPoint.timestamp.getTime() - 3600 * 1000);
            const lastHourPoints = points.filter(p => p.timestamp.getTime() >= oneHourAgo.getTime());
            if (lastHourPoints.length > 1) {
                const p1 = lastHourPoints[0];
                const p2 = lastHourPoints[lastHourPoints.length - 1];
                const dE = p2.energyAccumulated - p1.energyAccumulated;
                const dT = (p2.timestamp.getTime() - p1.timestamp.getTime()) / (1000 * 3600);
                if (dT > 0 && dE > 0) {
                    const slope = dE / dT; // kWh/h
                    const remaining = (cycle.setPoint || 0) - (points[points.length - 1].energyAccumulated || 0);
                    if (remaining > 0) {
                        const remainingHours = remaining / slope;
                        projectedEnd = new Date(lastPoint.timestamp.getTime() + remainingHours * 3600 * 1000);
                    }
                }
            }
        }

        return NextResponse.json({
            cycleId: cycle.id,
            startReal: cycle.startReal,
            endReal: cycle.endReal,
            endEstimated: projectedEnd,
            energyAccumulatedTotal: cycle.energyAccumulatedTotal,
            avgSerpentin,
            avgDoor,
            activeHours,
            dischargeTime: cycle.dischargeTime
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to compute metrics' }, { status: 500 });
    }
}
