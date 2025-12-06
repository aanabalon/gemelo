import { create, all, MathJsStatic } from 'mathjs';

// Create a mathjs instance so we can control available functions
const math = (create(all) as unknown) as MathJsStatic;

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

function iff(cond: any, a: any, b: any) {
    // allow using `iff(condition, trueExpr, falseExpr)` from admin DSL
    return cond ? a : b;
}

/**
 * Safely coerce values that may come from Influx into numbers for mathjs.
 */
function sanitizeContext(ctx: Record<string, any>): Record<string, number | boolean> {
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
export function evaluateFormula(expression: string, context: Record<string, any>): any {
    try {
        if (typeof expression !== 'string' || !expression.trim()) return null;

        const scope = sanitizeContext(context);

        // Attach helper functions under safe names
        const safeScope = {
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
        } as Record<string, any>;

        const scopeWithDefaults = new Proxy(safeScope, {
            get(target, prop: string | symbol) {
                if (prop in target) {
                    return (target as any)[prop];
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
        return math.evaluate(expression, scopeWithDefaults);
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
    } catch (err) {
        return false;
    }
}
