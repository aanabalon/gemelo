import { describe, it, expect, vi } from 'vitest';
import { sortConfigsByDependency, extractDependencies } from '@/lib/energy/dependencySort';
import { EnergyConfig } from '@prisma/client';
import { MIN_REAL_CONFIG_NAME } from '@/lib/energy/constants';

// Helper to create mock config
const makeConfig = (name: string, expression: string): EnergyConfig => ({
    id: name,
    name,
    expression,
    enabled: true,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastProcessedAt: null,
});

describe('Dependency Sort', () => {
    it('should extract dependencies correctly', () => {
        expect(extractDependencies('a + b')).toEqual(expect.arrayContaining(['a', 'b']));
        expect(extractDependencies('abs(x - y)')).toEqual(expect.arrayContaining(['x', 'y']));
        expect(extractDependencies('5 * temp')).toEqual(['temp']);
    });

    it('should sort simple dependencies (A depends on B)', () => {
        const configs = [
            makeConfig('A', 'B + 1'),
            makeConfig('B', '5'),
        ];
        const sorted = sortConfigsByDependency(configs);
        expect(sorted.map(c => c.name)).toEqual(['B', 'A']);
    });

    it('should put min_real first', () => {
        const configs = [
            makeConfig('A', '5'),
            makeConfig(MIN_REAL_CONFIG_NAME, 'min_real'),
        ];
        const sorted = sortConfigsByDependency(configs);
        expect(sorted[0].name).toBe(MIN_REAL_CONFIG_NAME);
    });

    it('should ignore self references when sorting configs', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const configs = [
                makeConfig(MIN_REAL_CONFIG_NAME, 'min_real'),
                makeConfig('Other', 'min_real + 1'),
            ];
            const sorted = sortConfigsByDependency(configs);
            expect(sorted[0].name).toBe(MIN_REAL_CONFIG_NAME);
            expect(warnSpy).not.toHaveBeenCalled();
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('should handle transitive dependencies (A -> B -> C)', () => {
        const configs = [
            makeConfig('A', 'B + 1'),
            makeConfig('C', '10'),
            makeConfig('B', 'C * 2'),
        ];
        const sorted = sortConfigsByDependency(configs);
        expect(sorted.map(c => c.name)).toEqual(['C', 'B', 'A']);
    });

    it('should handle circular dependencies gracefully', () => {
        const configs = [
            makeConfig('A', 'B + 1'),
            makeConfig('B', 'A + 1'),
        ];
        const sorted = sortConfigsByDependency(configs);
        // Should contain both, order doesn't strictly matter as long as it doesn't crash
        expect(sorted).toHaveLength(2);
        expect(sorted.map(c => c.name)).toEqual(expect.arrayContaining(['A', 'B']));
    });

    it('should handle complex graph', () => {
        // Delta_t = abs(Serpentin - Puerta)
        // Energy = Delta_t * Flow * Cp
        // Flow = 100
        // Cp = 4.18
        // Serpentin = raw
        // Puerta = raw
        const configs = [
            makeConfig('Energy', 'Delta_t * Flow * Cp'),
            makeConfig('Delta_t', 'abs(Serpentin - Puerta)'),
            makeConfig('Flow', '100'),
            makeConfig('Cp', '4.18'),
            makeConfig('Serpentin', 'raw_val'),
            makeConfig('Puerta', 'raw_val'),
        ];

        const sorted = sortConfigsByDependency(configs);
        const names = sorted.map(c => c.name);

        // Assertions
        expect(names.indexOf('Delta_t')).toBeGreaterThan(names.indexOf('Serpentin'));
        expect(names.indexOf('Delta_t')).toBeGreaterThan(names.indexOf('Puerta'));
        expect(names.indexOf('Energy')).toBeGreaterThan(names.indexOf('Delta_t'));
        expect(names.indexOf('Energy')).toBeGreaterThan(names.indexOf('Flow'));
        expect(names.indexOf('Energy')).toBeGreaterThan(names.indexOf('Cp'));
    });
});
