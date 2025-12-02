import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock InfluxDB client
const mockQueryRows = vi.fn();
const mockGetQueryApi = vi.fn().mockReturnValue({
    queryRows: mockQueryRows,
});

vi.mock('@influxdata/influxdb-client', () => ({
    InfluxDB: class {
        getQueryApi = mockGetQueryApi;
    },
}));

// Mock config
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(false),
    },
}));

// Import the function to test
// We need to use dynamic import because of the mocks
const { fetchRawData } = await import('@/lib/influx');

describe('fetchRawData min_real calculation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockInfluxResponse = (rows: any[]) => {
        mockQueryRows.mockImplementation((query, observer) => {
            rows.forEach(row => observer.next(row, { toObject: (r: any) => r }));
            observer.complete();
        });
    };

    it('should calculate min_real = 0 for the first point if no previousTimestamp is provided', async () => {
        const t0 = new Date('2025-12-01T10:00:00Z');
        mockInfluxResponse([
            { _time: t0.toISOString(), _value: 10, _field: 'Promedio_Serpentin_C' }
        ]);

        const result = await fetchRawData(t0, new Date(t0.getTime() + 1000));

        expect(result).toHaveLength(1);
        expect(result[0].min_real).toBe(0);
    });

    it('should calculate min_real correctly using previousTimestamp', async () => {
        const tMinus1 = new Date('2025-12-01T09:59:00Z'); // 1 minute before
        const t0 = new Date('2025-12-01T10:00:00Z');

        mockInfluxResponse([
            { _time: t0.toISOString(), _value: 10, _field: 'Promedio_Serpentin_C' }
        ]);

        // Pass tMinus1 as previousTimestamp
        const result = await fetchRawData(t0, new Date(t0.getTime() + 1000), tMinus1);

        expect(result).toHaveLength(1);
        expect(result[0].min_real).toBe(1); // 1 minute difference
    });

    it('should calculate min_real correctly for multiple points', async () => {
        const t0 = new Date('2025-12-01T10:00:00Z');
        const t1 = new Date('2025-12-01T10:05:00Z'); // 5 mins later

        mockInfluxResponse([
            { _time: t0.toISOString(), _value: 10, _field: 'Promedio_Serpentin_C' },
            { _time: t1.toISOString(), _value: 12, _field: 'Promedio_Serpentin_C' }
        ]);

        const result = await fetchRawData(t0, new Date(t1.getTime() + 1000));

        expect(result).toHaveLength(2);
        expect(result[0].min_real).toBe(0); // First point is 0 (no prev)
        expect(result[1].min_real).toBe(5); // Second point is 5 mins from first
    });
});
