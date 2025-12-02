import { create, all, MathJsStatic } from 'mathjs';

// Create a mathjs instance so we can control available functions
const math = create(all) as MathJsStatic;

// Restrict the imported functions we expose to the evaluator scope
// and add a few helpers commonly used in expressions.
function avg(...args: number[]) {
    const vals = args.map((v) => Number(v) || 0);
    if (vals.length === 0) return 0;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function sum(...args: number[]) {
    return args.map((v) => Number(v) || 0).reduce((s, v) => s + v, 0);
}

function iff<T>(cond: unknown, a: T, b: T): T {
    return cond ? a : b;
}

/**
 * Safely coerce values that may come from Influx into numbers for mathjs.
 */
function sanitizeContext(ctx: Record<string, unknown>): Record<string, number | boolean> {
    const out: Record<string, number | boolean> = {};
    for (const k of Object.keys(ctx)) {
        const v = ctx[k];
        if (v === null || v === undefined) continue;
        // Dates are not directly usable; skip or convert to timestamp number
        if (v instanceof Date) {
            out[k] = v.getTime();
            continue;
        }
        // Booleans pass-through
        if (typeof v === 'boolean') {
            out[k] = v;
            continue;
        }
        // Numbers or numeric strings
        const n = Number(v);
        if (!Number.isNaN(n)) {
            out[k] = n;
            continue;
        }
        // For any other type, ignore it (do not expose objects/functions)
    }
    return out;
}

/**
 * Evaluates a mathematical expression with a given context using a safe mathjs scope.
 * - Exposes only numeric/boolean variables from context
 * - Adds helper functions: avg, sum, iff
 */
export function evaluateFormula(
    expression: string,
    context: Record<string, unknown>
): number | null {
    try {
        if (typeof expression !== 'string' || !expression.trim()) return null;

        const scope = sanitizeContext(context);

        // Attach helper functions under safe names
        const safeScope: Record<string, number | boolean | ((...args: number[]) => number) | (<T>(cond: unknown, a: T, b: T) => T)> = {
            ...scope,
            avg,
            sum,
            if: iff,
            iff,
            // expose Math helpers if needed
            abs: Math.abs,
            min: Math.min,
            max: Math.max,
            pow: Math.pow,
        };

        const scopeWithDefaults = new Proxy(safeScope, {
            get(target, prop: string | symbol) {
                if (prop in target) {
                    return (target as Record<string, unknown>)[prop as string];
                }
                return 0;
            },
            has(target, prop) {
                // 'end' is a reserved keyword in mathjs (used for matrix indexing).
                // If we claim to have it, mathjs throws "Scope contains an illegal symbol".
                if (prop === 'end') return false;
                return true; // Pretend everything exists so 'get' is called and returns 0
            }
        });

        // Use math.evaluate with provided scope
        const result = math.evaluate(expression, scopeWithDefaults);
        const numeric = typeof result === 'number' ? result : Number(result);
        return Number.isFinite(numeric) ? numeric : null;
    } catch (error) {
        console.error(`Error evaluating formula "${expression}":`, error);
        return null;
    }
}

/**
 * Validates whether the expression parses correctly under mathjs.
 */
export function validateFormula(expression: string): boolean {
    try {
        if (typeof expression !== 'string' || !expression.trim()) return false;
        math.parse(expression);
        return true;
    } catch {
        return false;
    }
}
