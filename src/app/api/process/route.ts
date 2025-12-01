import { NextResponse } from 'next/server';
import { processCycles } from '@/lib/cycles';
import { getSession } from '@/lib/auth';
import { readCycleLogicConfig } from '@/lib/cycleLogicConfig';

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
        }
        if (session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { start, end, recalculate } = body;

        const startDate = start ? new Date(start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const endDate = end ? new Date(end) : new Date();

        const config = await readCycleLogicConfig();
        await processCycles(startDate, endDate, recalculate, config);

        return NextResponse.json({ success: true, message: 'Processing complete' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
}
