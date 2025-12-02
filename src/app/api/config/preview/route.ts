import { NextResponse } from 'next/server';
import { fetchRawData, type MappedDataPoint } from '@/lib/influx';
import { evaluateFormula, validateFormula } from '@/lib/formulas';
import { getSession } from '@/lib/auth';

/**
 * POST /api/config/preview
 * Body: { expression: string, start?: string, end?: string, limit?: number }
 * Returns an array of { timestamp, value } evaluated from Influx points
 */
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
        if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const { expression, start, end, limit } = body || {};

        if (!expression || typeof expression !== 'string') {
            return NextResponse.json({ error: 'Missing expression' }, { status: 400 });
        }

        if (!validateFormula(expression)) {
            return NextResponse.json({ error: 'Invalid expression syntax' }, { status: 400 });
        }

        const endDate = end ? new Date(end) : new Date();
        const startDate = start ? new Date(start) : new Date(endDate.getTime() - 60 * 60 * 1000); // default last 1h
        const max = Number(limit) || 100;

        // Fetch raw data from Influx for the given window
        const rows = await fetchRawData(startDate, endDate);

        if (!rows || rows.length === 0) {
            return NextResponse.json({ values: [] });
        }

        // Evaluate expression against each (or up to max) row
        const recent = rows.slice(-max);
        const values = recent.map((r: MappedDataPoint) => {
            const ctx: Record<string, unknown> = { ...r };
            ctx.timestamp = r.timestamp;
            ctx._time = r.timestamp;

            const v = evaluateFormula(expression, ctx);
            return {
                timestamp: r.timestamp,
                value: v,
            };
        });

        return NextResponse.json({ values });
    } catch (error) {
        console.error('Preview API error:', error);
        return NextResponse.json({ error: 'Preview evaluation failed' }, { status: 500 });
    }
}
