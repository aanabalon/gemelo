
import { evaluateFormula } from '../src/lib/formulas';

const expression1 = "7.44*8.47";
console.log(`Evaluating "${expression1}"...`);
const result1 = evaluateFormula(expression1, {});
console.log(`Result 1: ${result1}`);

const expression2 = "(0.1431 *(Promedio_Serpentin + 273) + 960.86 )/ 1000";
console.log(`Evaluating "${expression2}"...`);
// Promedio_Serpentin should default to 0 if not provided
const result2 = evaluateFormula(expression2, {});
console.log(`Result 2 (default 0): ${result2}`);

const result3 = evaluateFormula(expression2, { Promedio_Serpentin: 10 });
console.log(`Result 3 (val 10): ${result3}`);

if (result1 === null || result2 === null || result3 === null) {
    console.error("Test FAILED: Result is null");
    process.exit(1);
} else {
    console.log("Test PASSED");
}
