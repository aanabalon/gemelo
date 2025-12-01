
import { processCycles } from '../src/lib/cycles';
import { prisma } from '../src/lib/prisma';
import { getInfluxConfig } from '../src/lib/influx';

async function main() {
    const config = getInfluxConfig();
    console.log(`[Script] Using InfluxDB URL: ${config.url}`);
    console.log('Starting cycle reprocessing...');

    // Define a range to process (e.g., last 7 days)
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    console.log(`Processing range: ${start.toISOString()} -> ${end.toISOString()}`);

    try {
        await processCycles(start, end, true); // true = recalculate (wipe existing)
        console.log('Cycle processing completed successfully.');

        // Verify if new fields are populated
        const cycles = await prisma.cycle.findMany({
            orderBy: { startReal: 'desc' },
            take: 1,
        });

        if (cycles.length > 0) {
            const c = cycles[0];
            console.log('Latest Cycle:', {
                id: c.id,
                start: c.startReal,
                end: c.endReal,
                endEstimated: c.endEstimated,
                activeTime: c.activeTimeMinutes,
                overfrozen: c.overfrozenTimeMinutes,
                setPoint: c.setPoint
            });
        } else {
            console.log('No cycles found after processing.');
        }

    } catch (error) {
        console.error('Error during processing:', error);
        process.exit(1);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
