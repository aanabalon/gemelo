import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

// Mock Prisma
const prismaMocks = {
    cyclePointDelete: vi.fn(),
    cycleDelete: vi.fn(),
    cycleCreate: vi.fn(),
    cycleUpdate: vi.fn(),
    cycleUpdateMany: vi.fn(),
    cycleFindMany: vi.fn(),
    cyclePointCreateMany: vi.fn(),
    energyConfigFindMany: vi.fn(),
    transaction: vi.fn(),
};

vi.mock('@/lib/influx', () => ({
    fetchRawData: vi.fn(),
    fetchEarliestRawTimestamp: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/energy/loadDerivedValuesForRange', () => ({
    loadDerivedValuesByNames: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/cycleLogicConfig', () => ({
    readCycleLogicConfig: vi.fn().mockResolvedValue({
        minRiseDegrees: 8,
        riseWindowMinutes: 30,
        minSlope: 0.25,
        slopeDurationMinutes: 10,
        minDefrostTemperature: -4,
        minDefrostSeparationMinutes: 1,
        minCycleHours: 0.01,
        maxCycleHours: 168,
        operationStartValue: 1,
        operationEndValue: 0,
        cycleEnergySetPoint: 0,
        minOperationZeroMinutesForEndReal: 15,
    }),
}));

vi.mock('@/lib/notifications/notifier', () => ({
    triggerCycleNotifications: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
    return {
        prisma: {
            cyclePoint: {
                deleteMany: (...args: unknown[]) => prismaMocks.cyclePointDelete(...args),
                createMany: (...args: unknown[]) => prismaMocks.cyclePointCreateMany(...args),
            },
            cycle: {
                deleteMany: (...args: unknown[]) => prismaMocks.cycleDelete(...args),
                create: (...args: unknown[]) => prismaMocks.cycleCreate(...args),
                update: (...args: unknown[]) => prismaMocks.cycleUpdate(...args),
                updateMany: (...args: unknown[]) => prismaMocks.cycleUpdateMany(...args),
                findMany: (...args: unknown[]) => prismaMocks.cycleFindMany(...args),
                findFirst: vi.fn().mockResolvedValue(null),
            },
            energyConfig: {
                findMany: (...args: unknown[]) => prismaMocks.energyConfigFindMany(...args),
            },
            energyDerivedValue: {
                findFirst: vi.fn().mockResolvedValue(null),
            },
            cycleProcessingState: {
                findUnique: vi.fn().mockResolvedValue(null),
                upsert: vi.fn().mockResolvedValue(null),
            },
            $transaction: async (
                cb: (tx: {
                    cyclePoint: { deleteMany: (...args: unknown[]) => unknown; createMany: (...args: unknown[]) => unknown };
                    cycle: { deleteMany: (...args: unknown[]) => unknown; create: (...args: unknown[]) => unknown; update: (...args: unknown[]) => unknown; updateMany: (...args: unknown[]) => unknown };
                }) => unknown
            ) => {
                return cb({
                    cyclePoint: {
                        deleteMany: (...args: unknown[]) => prismaMocks.cyclePointDelete(...args),
                        createMany: (...args: unknown[]) => prismaMocks.cyclePointCreateMany(...args),
                    },
                    cycle: {
                        deleteMany: (...args: unknown[]) => prismaMocks.cycleDelete(...args),
                        create: (...args: unknown[]) => prismaMocks.cycleCreate(...args),
                        update: (...args: unknown[]) => prismaMocks.cycleUpdate(...args),
                        updateMany: (...args: unknown[]) => prismaMocks.cycleUpdateMany(...args),
                    },
                });
            },
        },
    };
});

const { fetchRawData } = await import('@/lib/influx');
const { processCycles } = await import('@/lib/cycles');
const mockFetchRawData = fetchRawData as unknown as Mock;

const testConfig = {
    minRiseDegrees: 8,
    riseWindowMinutes: 30,
    minSlope: 0.25,
    slopeDurationMinutes: 10,
    minDefrostTemperature: -4,
    minDefrostSeparationMinutes: 1,
    minCycleHours: 0.01,
    maxCycleHours: 168,
    operationStartValue: 1,
    operationEndValue: 0,
    cycleEnergySetPoint: 0,
    minOperationZeroMinutesForEndReal: 15,
};

const baseTime = new Date('2025-12-01T04:30:00.000Z');
const minutes = (n: number) => new Date(baseTime.getTime() + n * 60 * 1000);

const makePoint = (minute: number, serpTemp: number, opState: number, energyInstant = 0, minReal = 5) => ({
    timestamp: minutes(minute),
    Promedio_Serpentin: serpTemp,
    Promedio_Puerta: -5,
    Operacion: opState,
    Energia: energyInstant,
    min_real: minReal,
});

describe('cycles persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMocks.energyConfigFindMany.mockResolvedValue([]);
        prismaMocks.cycleFindMany.mockResolvedValue([]);
    });

    it('should update existing open cycle instead of recreating it', async () => {
        // 1. Setup: Existing open cycle in DB
        // Note: Cycle starts when operation resumes (min 30), not at discharge (min 20)
        const existingStart = minutes(30);
        const existingCycle = {
            id: 123,
            startReal: existingStart,
            endReal: null,
            isCurrent: true,
            points: [{ id: 1 }], // dummy
        };
        prismaMocks.cycleFindMany.mockResolvedValue([existingCycle]);
        prismaMocks.cycleUpdate.mockResolvedValue(existingCycle); // Mock return value

        // 2. Data: Same cycle pattern (discharge at min 20, then operation)
        mockFetchRawData.mockResolvedValue([
            makePoint(0, -12, 0, 0),
            makePoint(20, -3, 0, 0), // discharge
            makePoint(30, -15, 1, 0),
            makePoint(50, -14, 1, 0),
        ]);

        // 3. Run processCycles
        const result = await processCycles(new Date(baseTime), minutes(60), false, testConfig);

        // 4. Assertions
        expect(result?.openCycles).toBe(1);

        // Should NOT create new cycle
        expect(prismaMocks.cycleCreate).not.toHaveBeenCalled();

        // Should UPDATE existing cycle
        expect(prismaMocks.cycleUpdate).toHaveBeenCalledTimes(1);
        expect(prismaMocks.cycleUpdate).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 123 },
            data: expect.objectContaining({
                isCurrent: true,
                endReal: null,
            })
        }));

        // Should NOT delete the existing cycle
        expect(prismaMocks.cycleDelete).not.toHaveBeenCalled();
    });

    it('should create new cycle if no match found', async () => {
        prismaMocks.cycleFindMany.mockResolvedValue([]); // No existing cycles

        mockFetchRawData.mockResolvedValue([
            makePoint(0, -12, 0, 0),
            makePoint(20, -3, 0, 0), // discharge
            makePoint(30, -15, 1, 0),
            makePoint(35, -15, 1, 0), // Added point to give duration > 0
        ]);

        prismaMocks.cycleCreate.mockResolvedValue({ id: 999, endReal: null, isCurrent: true });

        await processCycles(new Date(baseTime), minutes(60), false, testConfig);

        expect(prismaMocks.cycleCreate).toHaveBeenCalledTimes(1);
        expect(prismaMocks.cycleUpdate).not.toHaveBeenCalled();
    });

    it('should not overwrite existing endReal when reprocessing after operation resumes', async () => {
        const existingEndReal = minutes(70);
        const existingCycle = {
            id: 123,
            startReal: minutes(30),
            endReal: existingEndReal,
            isCurrent: true,
            points: [{ id: 1 }],
        };

        prismaMocks.cycleFindMany.mockResolvedValue([existingCycle]);
        prismaMocks.cycleUpdate.mockResolvedValue(existingCycle);

        mockFetchRawData.mockResolvedValue([
            makePoint(0, -12, 0, 0),
            makePoint(20, -3, 0, 0), // discharge
            makePoint(30, -15, 1, 0),
            makePoint(40, -14, 1, 0),
            makePoint(60, -10, 0, 0),
            makePoint(70, -11, 0, 0), // first zero streak -> existing endReal
            makePoint(80, -13, 1, 0), // resume operation
            makePoint(100, -12, 0, 0),
            makePoint(110, -12, 0, 0), // new zero streak that should NOT change endReal
        ]);

        await processCycles(new Date(baseTime), minutes(140), false, testConfig);

        expect(prismaMocks.cycleUpdate).toHaveBeenCalledTimes(1);
        const updateArgs = prismaMocks.cycleUpdate.mock.calls[0][0];
        expect(updateArgs.data.endReal).toEqual(existingEndReal);
    });
});
