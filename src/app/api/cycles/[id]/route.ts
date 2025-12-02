import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const cycleId = parseInt(id);
        const cycle = await prisma.cycle.findUnique({
            where: { id: cycleId },
            include: {
                points: {
                    orderBy: { timestamp: 'asc' },
                },
            },
        });

        if (!cycle) {
            return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
        }

        return NextResponse.json(cycle);
    } catch (error) {
        console.error('Failed to fetch cycle by id', error);
        return NextResponse.json({ error: 'Failed to fetch cycle' }, { status: 500 });
    }
}
