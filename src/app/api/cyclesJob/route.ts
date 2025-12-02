import { NextResponse } from 'next/server';
import { ensureCyclesUpToDate } from '@/lib/cycles';

/**
 * API route de Next App Router para el job de ciclos.
 * Endpoint: GET /api/cyclesJob
 * Pensado para ser llamado periódicamente (cron) y procesar los ciclos de forma incremental.
 *
 * Cada ejecución:
 *  - Llama a ensureCyclesUpToDate() que encapsula la lógica de high watermark.
 */

export async function GET() {
    try {
        const result = await ensureCyclesUpToDate();

        return NextResponse.json({
            ok: true,
            from: result.processedFrom.toISOString(),
            to: result.processedTo.toISOString(),
            overlapMinutes: result.overlapMinutes,
            watermark: result.watermark?.toISOString() ?? null,
            watermarkExplanation: result.watermark
                ? 'endReal of last closed cycle'
                : 'no closed cycles yet',
        });
    } catch (error) {
        console.error('GET /api/cyclesJob error', error);
        return NextResponse.json(
            {
                ok: false,
                error: 'Failed to run cycles job',
            },
            { status: 500 },
        );
    }
}
