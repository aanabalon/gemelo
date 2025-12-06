import { Cycle } from '@prisma/client';
import { fetchRawData, fetchEarliestRawTimestamp, MappedDataPoint } from './influx';
import { prisma } from '@/lib/prisma';
import { loadDerivedValuesByNames } from '@/lib/energy/loadDerivedValuesForRange';
import {
    CycleLogicConfig,
    readCycleLogicConfig,
} from '@/lib/cycleLogicConfig';

/**
 * Main function to process data and detect cycles.
 * Can be triggered by a cron job or manually after config changes.
 * 
 * @param start Date to start processing from
 * @param end Date to end processing
 * @param recalculate If true, wipes existing cycles in the range and re-processes
 */
export async function processCycles(
    start: Date,
    end: Date,
    recalculate: boolean = false,
    logicOverrides?: CycleLogicConfig
) {
    if (recalculate) {
        // Wipe existing cycles and points in range (or all if full recalc)
        // For simplicity in this MVP, we might wipe all if recalculating logic globally
        await prisma.cyclePoint.deleteMany({});
        await prisma.cycle.deleteMany({});
        // Reset sequence if possible, or just let it auto-increment
    }

    const config = logicOverrides ?? (await readCycleLogicConfig());
    const energyConfigs = await prisma.energyConfig.findMany({ where: { enabled: true } });

    const effectiveStart = await resolveAvailableStart(start);
    if (effectiveStart >= end) {
        console.warn('[Cycles] Rango inválido para procesamiento de ciclos.');
        return;
    }

    // Para ejecuciones incrementales (recalculate=false), hacemos que el proceso
    // sea idempotente: antes de guardar, limpiamos los ciclos existentes en el
    // rango que vamos a recalcular, para no duplicarlos.
    if (!recalculate) {
        await prisma.cyclePoint.deleteMany({
            where: {
                cycle: {
                    startReal: {
                        gte: effectiveStart,
                        lt: end,
                    },
                },
            },
        });
        await prisma.cycle.deleteMany({
            where: {
                startReal: {
                    gte: effectiveStart,
                    lt: end,
                },
            },
        });
    }

    // 2. Fetch Raw Data en ventanas para evitar timeouts
    const rawData = await fetchRawDataInChunks(effectiveStart, end);
    const derivedMap = await loadDerivedValuesByNames(
        energyConfigs.map(cfg => cfg.name),
        effectiveStart,
        end
    );

    const points = rawData.map((point) => {
        const timestampKey = point.timestamp.toISOString();
        const derivedValues = derivedMap[timestampKey] ?? {};
        const context = { ...point, ...derivedValues };
        const serpTempRaw = context['Promedio_Serpentin'] ?? context['Promedio_Serpentin_C'];
        const doorTempRaw = context['Promedio_Puerta'] ?? context['Promedio_Puerta_C'];

        const opStateRaw = context['Operacion'] ?? context['Estado_Operacion'];
        const energyRaw = context['Energia'] ?? context['Energia_Instantanea'];

        // If critical data is missing, skip this point to avoid false positives (e.g. 0°C spikes or 0 energy)
        if (serpTempRaw === undefined || serpTempRaw === null ||
            opStateRaw === undefined || opStateRaw === null ||
            energyRaw === undefined || energyRaw === null) {
            return null;
        }

        const serpTemp = Number(serpTempRaw);
        const doorTemp = Number(doorTempRaw ?? 0);
        const operationState = Number(opStateRaw);
        const energyInstant = Number(energyRaw);
        return {
            timestamp: point.timestamp,
            serpTemp,
            doorTemp,
            operationState,
            energyInstant,
        };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    if (!points.length) return;

    const descargas = detectDescargas(points, config);
    if (descargas.length < 2) {
        console.warn('No se pudieron detectar descargas reales con los criterios definidos.');
        return;
    }

    const cycles = buildCyclesFromDescargas(points, descargas, config);

    for (const cycle of cycles) {
        await saveCycle(cycle, cycle.points);
    }
}

const CHUNK_HOURS = 24 * 7; // una semana por consulta para evitar timeouts

async function fetchRawDataInChunks(start: Date, end: Date): Promise<MappedDataPoint[]> {
    const chunks: MappedDataPoint[] = [];
    const chunkMs = CHUNK_HOURS * 60 * 60 * 1000;
    let cursor = new Date(start);

    while (cursor < end) {
        const chunkEnd = new Date(Math.min(cursor.getTime() + chunkMs, end.getTime()));
        const data = await fetchRawData(cursor, chunkEnd);
        chunks.push(...data);
        // Avanza 1 ms para evitar duplicar el último punto
        cursor = new Date(chunkEnd.getTime() + 1);
    }

    return chunks.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

async function resolveAvailableStart(requestedStart: Date): Promise<Date> {
    const earliestDerived = await prisma.energyDerivedValue.findFirst({
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
    });

    let baseline = earliestDerived?.timestamp ?? null;

    if (!baseline) {
        baseline = await fetchEarliestRawTimestamp();
    }

    if (!baseline) {
        return requestedStart;
    }

    const effective = Math.max(requestedStart.getTime(), baseline.getTime());
    if (effective !== requestedStart.getTime()) {
        console.info(
            `[Cycles] Ajustando fecha de inicio de ${requestedStart.toISOString()} a ${new Date(
                effective
            ).toISOString()} según datos disponibles.`
        );
    }
    return new Date(effective);
}

function detectDescargas(
    points: Array<{ timestamp: Date; serpTemp: number }>,
    config: CycleLogicConfig
): Date[] {
    const descargas: Date[] = [];
    const TEMP_INCREASE = config.minRiseDegrees;
    const INCREASE_WINDOW_MS = config.riseWindowMinutes * 60 * 1000;
    const SLOPE_WINDOW_MS = config.slopeDurationMinutes * 60 * 1000;
    const SLOPE_THRESHOLD = config.minSlope;
    const TEMP_THRESHOLD = config.minDefrostTemperature;
    const MIN_GAP_MS = config.minDefrostSeparationMinutes * 60 * 1000;

    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const currentTime = current.timestamp.getTime();
        if (current.serpTemp <= TEMP_THRESHOLD) continue;

        // Condition A: increase ≥ 8°C within 30 minutes
        let condA = false;
        for (let j = i - 1; j >= 0; j--) {
            const dt = currentTime - points[j].timestamp.getTime();
            if (dt > INCREASE_WINDOW_MS) break;
            if (current.serpTemp - points[j].serpTemp >= TEMP_INCREASE) {
                condA = true;
                // Log potential discharge for debugging
                console.log('[detectDescargas] Cond A met (Temp Rise)', {
                    time: current.timestamp.toISOString(),
                    temp: current.serpTemp,
                    prevTime: points[j].timestamp.toISOString(),
                    prevTemp: points[j].serpTemp,
                    diff: current.serpTemp - points[j].serpTemp
                });
                break;
            }
        }
        if (!condA) continue;

        // Condition B: slope ≥ 0.25°C/min during at least 10 minutes
        let condB = false;
        for (let j = i - 1; j >= 0; j--) {
            const dtMs = currentTime - points[j].timestamp.getTime();
            if (dtMs < SLOPE_WINDOW_MS) continue;
            const minutes = dtMs / 60000;
            const slope = (current.serpTemp - points[j].serpTemp) / minutes;
            if (slope >= SLOPE_THRESHOLD) {
                condB = true;
            }
            break;
        }
        if (!condB) continue;

        const lastDescarga = descargas[descargas.length - 1];
        if (lastDescarga && currentTime - lastDescarga.getTime() < MIN_GAP_MS) {
            continue;
        }

        descargas.push(current.timestamp);
    }

    return descargas;
}

function buildCyclesFromDescargas(
    points: Array<{
        timestamp: Date;
        serpTemp: number;
        doorTemp: number;
        operationState: number;
        energyInstant: number;
    }>,
    descargas: Date[],
    config: CycleLogicConfig
) {
    const cycles: Array<{
        tunnelId: string;
        startReal: Date;
        endReal: Date | null;
        isCurrent: boolean;
        energyAccumulatedTotal: number;
        setPoint: number;
        descargaSiguiente?: Date;
        points: any[];
        endEstimated?: Date;
        activeTimeMinutes?: number;
        overfrozenTimeMinutes?: number;
    }> = [];

    // Filter descargas to ignore noise (intervals shorter than minCycleHours)
    const validDescargas: Date[] = [];
    if (descargas.length > 0) {
        validDescargas.push(descargas[0]);
        for (let i = 1; i < descargas.length; i++) {
            const prev = validDescargas[validDescargas.length - 1];
            const curr = descargas[i];
            const hoursDiff = (curr.getTime() - prev.getTime()) / (1000 * 3600);

            if (hoursDiff >= config.minCycleHours) {
                validDescargas.push(curr);
            } else {
                console.log('[Cycles] Ignoring short interval discharge', {
                    prev: prev.toISOString(),
                    curr: curr.toISOString(),
                    hoursDiff: hoursDiff.toFixed(2),
                    minCycleHours: config.minCycleHours
                });
            }
        }
    }

    const effectiveDescargas = validDescargas;

    // --- CLOSED CYCLES ---
    for (let i = 0; i < effectiveDescargas.length - 1; i++) {
        const currentDesc = effectiveDescargas[i];
        const nextDesc = effectiveDescargas[i + 1];
        const startPoint = points.find(
            (p) =>
                p.timestamp > currentDesc &&
                p.operationState === config.operationStartValue
        );
        const endPointIndex = (() => {
            for (let idx = points.length - 1; idx >= 0; idx--) {
                const p = points[idx];
                if (p.timestamp >= nextDesc) continue;
                if (p.operationState === config.operationEndValue) {
                    return idx;
                }
            }
            return -1;
        })();

        if (!startPoint || endPointIndex === -1) continue;
        const endPoint = points[endPointIndex];
        if (endPoint.timestamp <= startPoint.timestamp) continue;

        const durationHours =
            (endPoint.timestamp.getTime() - startPoint.timestamp.getTime()) / (1000 * 3600);
        if (durationHours < config.minCycleHours || durationHours > config.maxCycleHours) {
            continue;
        }

        const slice = points.filter(
            (p) => p.timestamp >= startPoint.timestamp && p.timestamp <= endPoint.timestamp
        );
        if (!slice.length) continue;

        // Calculate metrics using shared helper
        const metrics = calculateCycleMetrics(slice, config, endPoint.timestamp);

        cycles.push({
            tunnelId: 'tunnel-1',
            startReal: startPoint.timestamp,
            endReal: endPoint.timestamp,
            isCurrent: false,
            energyAccumulatedTotal: metrics.energyAccumulatedTotal,
            setPoint: config.cycleEnergySetPoint ?? 0,
            descargaSiguiente: nextDesc,
            points: metrics.cyclePoints,
            endEstimated: metrics.endEstimated,
            activeTimeMinutes: metrics.activeTimeMinutes,
            overfrozenTimeMinutes: metrics.overfrozenTimeMinutes
        });
    }

    // --- OPEN CYCLE ---
    if (effectiveDescargas.length >= 1 && points.length > 0) {
        const lastDesc = effectiveDescargas[effectiveDescargas.length - 1];

        // Get all candidate points after the last descarga
        const candidatePoints = points.filter(p => p.timestamp > lastDesc);

        if (candidatePoints.length > 0) {
            let startIdx = -1;
            const CONFIRMATION_WINDOW = 5;

            for (let i = 0; i < candidatePoints.length; i++) {
                const p = candidatePoints[i];
                if (p.operationState !== config.operationStartValue) continue;

                const tempInOperatingRange = p.serpTemp < -10;
                let sustainedCount = 0;
                const windowEnd = Math.min(i + CONFIRMATION_WINDOW, candidatePoints.length);
                for (let j = i; j < windowEnd; j++) {
                    if (candidatePoints[j].operationState === config.operationStartValue) {
                        sustainedCount++;
                    }
                }
                const isSustained = sustainedCount >= Math.ceil(CONFIRMATION_WINDOW * 0.5);

                if (tempInOperatingRange || isSustained) {
                    startIdx = i;
                    console.log('[Cycles][OpenCycle] Inicio de ciclo detectado', {
                        timestamp: p.timestamp.toISOString(),
                        validatedBy: tempInOperatingRange ? 'temperatura' : 'operación sostenida',
                    });
                    break;
                }
            }

            if (startIdx >= 0) {
                const startPoint = candidatePoints[startIdx];
                const lastPoint = candidatePoints[candidatePoints.length - 1];
                const durationHours =
                    (lastPoint.timestamp.getTime() - startPoint.timestamp.getTime()) /
                    (1000 * 3600);

                if (durationHours > 0 && durationHours <= config.maxCycleHours) {
                    const slice = candidatePoints.slice(startIdx);

                    if (slice.length) {
                        // Calculate metrics using shared helper
                        // For open cycle, we pass lastPoint.timestamp as the effective end for overfrozen calc
                        const metrics = calculateCycleMetrics(slice, config, lastPoint.timestamp);

                        console.log('[Cycles][OpenCycle] Resumen de ciclo abierto', {
                            startReal: startPoint.timestamp.toISOString(),
                            lastPoint: lastPoint.timestamp.toISOString(),
                            durationHours: durationHours.toFixed(2),
                            activeTimeMinutes: metrics.activeTimeMinutes.toFixed(2),
                            energyAccumulatedTotal: metrics.energyAccumulatedTotal,
                        });

                        cycles.push({
                            tunnelId: 'tunnel-1',
                            startReal: startPoint.timestamp,
                            endReal: null, // Open cycle
                            isCurrent: true,
                            energyAccumulatedTotal: metrics.energyAccumulatedTotal,
                            setPoint: config.cycleEnergySetPoint ?? 0,
                            descargaSiguiente: undefined,
                            points: metrics.cyclePoints,
                            endEstimated: metrics.endEstimated,
                            activeTimeMinutes: metrics.activeTimeMinutes,
                            overfrozenTimeMinutes: metrics.overfrozenTimeMinutes,
                        });
                    }
                } else {
                    console.log('[Cycles][OpenCycle] Ciclo descartado por duración', {
                        durationHours: durationHours.toFixed(2),
                        maxCycleHours: config.maxCycleHours,
                    });
                }
            } else {
                console.log('[Cycles][OpenCycle] No se encontró inicio válido de ciclo después de última descarga');
            }
        }
    }

    return cycles;
}

function calculateCycleMetrics(
    slice: Array<{
        timestamp: Date;
        serpTemp: number;
        doorTemp: number;
        operationState: number;
        energyInstant: number;
    }>,
    config: CycleLogicConfig,
    endRealTimestamp: Date
) {
    // 1. Build points with accumulated energy
    const cyclePoints = buildCyclePoints(slice);

    // 2. Calculate Total Energy
    const energyAccumulatedTotal =
        cyclePoints.length > 0
            ? cyclePoints[cyclePoints.length - 1].energyAccumulated
            : 0;

    const setPoint = config.cycleEnergySetPoint ?? 0;

    // 3. Calculate Estimated End (first point where energy >= setPoint)
    const estimatedEndPoint = cyclePoints.find(
        (p) => p.energyAccumulated >= setPoint
    );
    const endEstimated = estimatedEndPoint
        ? estimatedEndPoint.timestamp
        : undefined;

    // 4. Calculate Active Time
    let activeTimeMinutes = 0;
    for (let k = 1; k < slice.length; k++) {
        const p = slice[k];
        const prev = slice[k - 1];
        if (prev.operationState === 1) {
            const dtMinutes =
                (p.timestamp.getTime() - prev.timestamp.getTime()) /
                60000;
            activeTimeMinutes += dtMinutes;
        }
    }

    // 5. Calculate Overfrozen Time
    let overfrozenTimeMinutes = 0;
    if (endEstimated && endEstimated < endRealTimestamp) {
        overfrozenTimeMinutes =
            (endRealTimestamp.getTime() - endEstimated.getTime()) /
            60000;
    }

    return {
        cyclePoints,
        energyAccumulatedTotal,
        endEstimated,
        activeTimeMinutes,
        overfrozenTimeMinutes
    };
}

function buildCyclePoints(
    slice: Array<{
        timestamp: Date;
        serpTemp: number;
        doorTemp: number;
        operationState: number;
        energyInstant: number;
    }>
) {
    if (!slice.length) return [];
    let accumulatedEnergy = 0;
    const points: any[] = [];

    for (let i = 0; i < slice.length; i++) {
        const point = slice[i];

        // Summation logic: accumulate the energy delta
        accumulatedEnergy += point.energyInstant;

        points.push({
            timestamp: point.timestamp,
            avgSerpentin: point.serpTemp,
            avgDoor: point.doorTemp,
            operationState: point.operationState,
            energyInstant: point.energyInstant,
            energyAccumulated: accumulatedEnergy,
            hourFromCycleStart:
                (point.timestamp.getTime() - slice[0].timestamp.getTime()) /
                (1000 * 3600),
        });
    }

    return points;
}

async function saveCycle(cycleData: any, pointsData: any[]) {
    // Compute aggregates: average temps, energy total, dischargeTime
    const avgSerpentinTotal = pointsData.length > 0 ? pointsData.reduce((s, p) => s + (p.avgSerpentin || 0), 0) / pointsData.length : 0;
    const avgDoorTotal = pointsData.length > 0 ? pointsData.reduce((s, p) => s + (p.avgDoor || 0), 0) / pointsData.length : 0;
    const energyAccumulatedTotal = pointsData.length > 0 ? pointsData[pointsData.length - 1].energyAccumulated : 0;

    // dischargeTime: STRICTLY from cycleData.descargaSiguiente.
    // We do NOT infer it from energy setpoint anymore, as requested by user invariants.
    const dischargeTime: Date | undefined = cycleData.descargaSiguiente;

    // Create cycle and points in a transaction, computing a correlative id = max(id)+1 to avoid gaps
    await prisma.$transaction(async (tx) => {
        // Only unset other current cycles if this one claims to be current
        if (cycleData.isCurrent) {
            await tx.cycle.updateMany({
                data: { isCurrent: false },
            });
        }

        const cycle = await tx.cycle.create({
            data: {
                tunnelId: cycleData.tunnelId,
                startReal: cycleData.startReal,
                endReal: cycleData.endReal,
                endEstimated: cycleData.endEstimated,
                dischargeTime: dischargeTime,
                isCurrent: cycleData.isCurrent,
                energyAccumulatedTotal: energyAccumulatedTotal,
                setPoint: cycleData.setPoint,
                avgSerpentinTotal,
                avgDoorTotal,
                activeTimeMinutes: cycleData.activeTimeMinutes,
                overfrozenTimeMinutes: cycleData.overfrozenTimeMinutes,
            }
        });

        const pointsWithId = pointsData.map(p => ({ ...p, cycleId: cycle.id }));
        if (pointsWithId.length > 0) {
            // prisma createMany may not return ids; it's fine for bulk insert
            await tx.cyclePoint.createMany({ data: pointsWithId });
        }
    });
}

/**
 * Helper to get the high watermark of cycle processing.
 */
export async function getCycleProcessingState() {
    return prisma.cycleProcessingState.findUnique({ where: { id: 1 } });
}

/**
 * Helper to update the high watermark of cycle processing.
 * 
 * IMPORTANT: The watermark represents "up to where we have stable CLOSED cycles",
 * NOT "the last time we processed".
 * 
 * It should be set to the endReal of the last CLOSED cycle (endReal != null),
 * or null if there are no closed cycles yet.
 */
export async function updateCycleProcessingState(newTimestamp: Date | null) {
    await prisma.cycleProcessingState.upsert({
        where: { id: 1 },
        update: { lastProcessedTimestamp: newTimestamp },
        create: { id: 1, lastProcessedTimestamp: newTimestamp },
    });
}

/**
 * Calculates the correct watermark value based on existing cycles.
 * Returns the endReal of the last closed cycle, or null if none exist.
 */
export async function calculateWatermarkFromClosedCycles(): Promise<Date | null> {
    const lastClosedCycle = await prisma.cycle.findFirst({
        where: { endReal: { not: null } },
        orderBy: { endReal: 'desc' },
        select: { endReal: true },
    });

    return lastClosedCycle?.endReal ?? null;
}

/**
 * Ensures that cycles are processed up to the current time.
 * 
 * KEY BEHAVIOR:
 * - The watermark (lastProcessedTimestamp) represents the end of the last CLOSED cycle
 * - Everything before (watermark - overlap) is considered frozen history
 * - Everything from (watermark - overlap) onward is recalculated, including:
 *   - Cycles near the boundary
 *   - The complete OPEN cycle from its true start (not truncated)
 */
export async function ensureCyclesUpToDate() {
    const CYCLE_JOB_OVERLAP_MINUTES = 30;
    const now = new Date();

    const state = await getCycleProcessingState();
    let start: Date;

    if (state?.lastProcessedTimestamp) {
        // Normal case: watermark exists (endReal of last closed cycle)
        // Process from (watermark - overlap) to ensure cycles near boundary are correct
        start = new Date(state.lastProcessedTimestamp.getTime() - CYCLE_JOB_OVERLAP_MINUTES * 60 * 1000);
        console.log('[ensureCyclesUpToDate] Using watermark', {
            watermark: state.lastProcessedTimestamp.toISOString(),
            startProcessing: start.toISOString(),
            overlapMinutes: CYCLE_JOB_OVERLAP_MINUTES,
        });
    } else {
        // Initial case: no watermark yet
        const firstCycle = await prisma.cycle.findFirst({ orderBy: { startReal: 'asc' } });
        if (firstCycle) {
            start = firstCycle.startReal;
            console.log('[ensureCyclesUpToDate] No watermark, using first cycle', {
                firstCycleStart: start.toISOString(),
            });
        } else {
            // Fallback: 7 días atrás si no hay nada
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            console.log('[ensureCyclesUpToDate] No watermark, no cycles, using 7-day fallback', {
                start: start.toISOString(),
            });
        }
    }

    const config = await readCycleLogicConfig();

    // Process cycles in the range [start, now]
    // This will delete and recreate cycles with startReal >= start
    await processCycles(start, now, false, config);

    // Update watermark to endReal of last closed cycle
    const newWatermark = await calculateWatermarkFromClosedCycles();
    await updateCycleProcessingState(newWatermark);

    console.log('[ensureCyclesUpToDate] Updated watermark', {
        newWatermark: newWatermark?.toISOString() ?? 'null',
        explanation: newWatermark
            ? 'endReal of last closed cycle'
            : 'no closed cycles yet (only open cycle exists)',
    });

    return {
        processedFrom: start,
        processedTo: now,
        overlapMinutes: CYCLE_JOB_OVERLAP_MINUTES,
        watermark: newWatermark,
    };
}
