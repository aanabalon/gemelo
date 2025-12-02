import { EnergyConfig } from '@prisma/client';
import { create, all, MathJsStatic } from 'mathjs';
import { MIN_REAL_CONFIG_NAME } from './constants';

const math = create(all) as MathJsStatic;

/**
 * Extracts variable names from a mathjs expression.
 */
export function extractDependencies(expression: string): string[] {
    try {
        if (!expression || !expression.trim()) return [];
        const node = math.parse(expression);
        const dependencies = new Set<string>();

        node.traverse((child: any) => {
            if (child.isSymbolNode) {
                dependencies.add(child.name);
            }
        });

        return Array.from(dependencies);
    } catch (error) {
        console.warn(`Failed to parse expression "${expression}" for dependencies:`, error);
        return [];
    }
}

/**
 * Sorts EnergyConfigs topologically based on their formula dependencies.
 * - min_real is always first.
 * - If A depends on B, B comes before A.
 * - Handles circular dependencies by breaking the cycle (best effort).
 */
export function sortConfigsByDependency(configs: EnergyConfig[]): EnergyConfig[] {
    const configMap = new Map(configs.map(c => [c.name, c]));
    const visited = new Set<string>();
    const tempVisited = new Set<string>(); // For cycle detection
    const sorted: EnergyConfig[] = [];

    // Helper to visit a node
    function visit(configName: string) {
        if (visited.has(configName)) return;
        if (tempVisited.has(configName)) {
            console.warn(`Circular dependency detected involving ${configName}. Breaking cycle.`);
            return;
        }

        tempVisited.add(configName);

        const config = configMap.get(configName);
        if (config && config.expression) {
            const dependencies = extractDependencies(config.expression);
            for (const dep of dependencies) {
                if (dep === configName) {
                    continue;
                }
                // Only visit if it's one of the configs we are sorting
                if (configMap.has(dep)) {
                    visit(dep);
                }
            }
        }

        tempVisited.delete(configName);
        visited.add(configName);
        if (config) {
            sorted.push(config);
        }
    }

    // 1. Always process MIN_REAL_CONFIG_NAME first if it exists
    if (configMap.has(MIN_REAL_CONFIG_NAME)) {
        visit(MIN_REAL_CONFIG_NAME);
    }

    // 2. Process all other configs
    for (const config of configs) {
        if (!visited.has(config.name)) {
            visit(config.name);
        }
    }

    return sorted;
}
