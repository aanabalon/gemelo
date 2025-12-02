import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

const prismaMocks = {
  cyclePointDelete: vi.fn(),
  cycleDelete: vi.fn(),
  cycleCreate: vi.fn(),
  cycleUpdate: vi.fn(), // Added
  cycleUpdateMany: vi.fn(),
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
        update: (...args: unknown[]) => prismaMocks.cycleUpdate(...args), // Added
        updateMany: (...args: unknown[]) => prismaMocks.cycleUpdateMany(...args),
        findMany: vi.fn().mockResolvedValue([]), // Added
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
          cycle: { deleteMany: (...args: unknown[]) => unknown; create: (...args: unknown[]) => unknown; updateMany: (...args: unknown[]) => unknown };
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

describe('cycles processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.energyConfigFindMany.mockResolvedValue([]);
  });

  it('0 descargas -> no ciclos creados', async () => {
    mockFetchRawData.mockResolvedValue([
      makePoint(0, -12, 0, 0),
      makePoint(10, -10, 0, 0),
      makePoint(20, -11, 0, 0),
    ]);

    const result = await processCycles(new Date(baseTime), minutes(30), false, testConfig);

    expect(result).toBeDefined();
    expect(result?.descargasCount).toBe(0);
    expect(prismaMocks.cycleCreate).not.toHaveBeenCalled();
  });

  it('1 descarga -> crea ciclo abierto con dischargeTime de la descarga', async () => {
    // Descarga: serpTemp sube de -12 a -3 en 20 minutos
    mockFetchRawData.mockResolvedValue([
      makePoint(0, -12, 0, 0),
      makePoint(20, -3, 0, 0), // descarga detectada aquí
      makePoint(30, -15, 1, 0),
      makePoint(50, -14, 1, 0),
    ]);

    prismaMocks.cycleCreate.mockResolvedValue({ id: 1, endReal: null, isCurrent: true });

    const result = await processCycles(new Date(baseTime), minutes(60), false, testConfig);

    expect(result?.descargasCount).toBe(1);
    expect(result?.openCycles).toBe(1);
    expect(prismaMocks.cycleCreate).toHaveBeenCalledTimes(1);
    const saved = prismaMocks.cycleCreate.mock.calls[0][0].data;
    expect(saved.isCurrent).toBe(true);
    expect(saved.endReal).toBeNull();
    expect(saved.dischargeTime?.toISOString()).toBe(minutes(20).toISOString());
  });

  it('marca fin real por operación=0 sostenida pero mantiene ciclo abierto', async () => {
    const points = [
      makePoint(0, -12, 0, 0),
      makePoint(20, -3, 0, 0), // descarga
      makePoint(30, -15, 1, 0),
      makePoint(40, -14, 1, 0),
      makePoint(55, -13, 1, 0),
      makePoint(60, -12, 0, 0),
      makePoint(65, -12, 0, 0),
      makePoint(70, -12, 0, 0),
    ];
    mockFetchRawData.mockResolvedValue(points);

    prismaMocks.cycleCreate.mockResolvedValue({ id: 2, endReal: points[7].timestamp, isCurrent: true });

    const result = await processCycles(new Date(baseTime), minutes(80), false, testConfig);

    expect(result?.openCycles).toBe(1);
    expect(result?.closedCycles).toBe(0);

    expect(prismaMocks.cycleCreate).toHaveBeenCalledTimes(1);
    const saved = prismaMocks.cycleCreate.mock.calls[0][0].data;
    expect(saved.isCurrent).toBe(true);
    expect(saved.endReal?.toISOString()).toBe(points[7].timestamp.toISOString());
  });

  it('calcula endEstimated cuando la energía acumulada alcanza el set point', async () => {
    const configWithSetPoint = { ...testConfig, cycleEnergySetPoint: 5 };
    const points = [
      makePoint(0, -12, 0, 0),
      makePoint(20, -3, 0, 0), // descarga 1
      makePoint(25, -15, 1, 2),
      makePoint(30, -14, 1, 3), // acumulado 5 kWh
      makePoint(40, -14, 0, 0), // fin operación ciclo 1
      makePoint(110, -12, 0, 0),
      makePoint(120, -2, 0, 0), // descarga 2
      makePoint(130, -14, 1, 0),
    ];
    mockFetchRawData.mockResolvedValue(points);

    prismaMocks.cycleCreate
      .mockResolvedValueOnce({ id: 1, endReal: points[4].timestamp, isCurrent: false })
      .mockResolvedValueOnce({ id: 2, endReal: null, isCurrent: true });

    await processCycles(new Date(baseTime), minutes(150), false, configWithSetPoint);

    expect(prismaMocks.cycleCreate).toHaveBeenCalled();
    const closedCycle = prismaMocks.cycleCreate.mock.calls[0][0].data;
    expect(closedCycle.endEstimated?.toISOString()).toBe(points[3].timestamp.toISOString());
  });

  it('2 descargas -> ciclo cerrado y ciclo abierto final', async () => {
    // Primera descarga en min 20, segunda en min 120
    const points = [
      makePoint(0, -12, 0, 0),
      makePoint(20, -3, 0, 0), // descarga 1
      makePoint(25, -15, 1, 0),
      makePoint(60, -9, 0, 0), // fin operación ciclo 1
      makePoint(110, -12, 0, 0),
      makePoint(120, -2, 0, 0), // descarga 2
      makePoint(125, -14, 1, 0),
      makePoint(140, -13, 1, 0),
    ];
    mockFetchRawData.mockResolvedValue(points);

    prismaMocks.cycleCreate
      .mockResolvedValueOnce({ id: 1, endReal: points[3].timestamp, isCurrent: false })
      .mockResolvedValueOnce({ id: 2, endReal: null, isCurrent: true });

    const result = await processCycles(new Date(baseTime), minutes(140), false, testConfig);

    expect(result?.descargasCount).toBe(2);
    expect(result?.closedCycles).toBe(1);
    expect(result?.openCycles).toBe(1);
    expect(prismaMocks.cycleCreate).toHaveBeenCalledTimes(2);
  });

  it('recalculate=true limpia y recrea ciclos sin duplicar', async () => {
    mockFetchRawData.mockResolvedValue([
      makePoint(0, -12, 0, 0),
      makePoint(20, -3, 0, 0), // descarga
      makePoint(30, -15, 1, 0),
      makePoint(45, -14, 1, 0),
    ]);

    prismaMocks.cycleCreate.mockResolvedValue({ id: 10, endReal: null, isCurrent: true });

    const result = await processCycles(new Date(baseTime), minutes(40), true, testConfig);

    expect(prismaMocks.cyclePointDelete).toHaveBeenCalled();
    expect(prismaMocks.cycleDelete).toHaveBeenCalled();
    expect(prismaMocks.cycleCreate).toHaveBeenCalledTimes(1);
    expect(result?.cyclesCreated).toBe(1);
  });
});
