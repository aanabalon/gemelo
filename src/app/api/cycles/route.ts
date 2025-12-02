import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const cycles = await prisma.cycle.findMany({
            orderBy: { startReal: 'asc' }, // Order by start time (oldest first)
            take: 50, // Limit to last 50 cycles for performance
        });

        // Add display index (1-based) for visual numbering
        const cyclesWithDisplayIndex = cycles.map((cycle, index) => ({
            ...cycle,
            displayIndex: index + 1,
        }));

        // Return in reverse order (newest first) for dashboard display
        return NextResponse.json(cyclesWithDisplayIndex.reverse());
    } catch (error) {
        console.error('Failed to fetch cycles', error);
        return NextResponse.json({ error: 'Failed to fetch cycles' }, { status: 500 });
    }
}
