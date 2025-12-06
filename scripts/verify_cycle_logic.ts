
// Mock of the buildCyclePoints function from src/lib/cycles.ts (before fix)
function buildCyclePointsOld(
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
        if (i > 0) {
            const prev = slice[i - 1];
            const dtHours =
                (point.timestamp.getTime() - prev.timestamp.getTime()) / (1000 * 3600);
            accumulatedEnergy += prev.energyInstant * Math.max(dtHours, 0);
        }

        points.push({
            timestamp: point.timestamp,
            energyInstant: point.energyInstant,
            energyAccumulated: accumulatedEnergy,
        });
    }

    return points;
}

// Mock of the buildCyclePoints function (after fix - expected behavior)
function buildCyclePointsNew(
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
        // Summation logic: just add the energy delta
        accumulatedEnergy += point.energyInstant;

        points.push({
            timestamp: point.timestamp,
            energyInstant: point.energyInstant,
            energyAccumulated: accumulatedEnergy,
        });
    }

    return points;
}

// Test Data
const now = new Date();
const testData = [
    { timestamp: new Date(now.getTime()), energyInstant: 10, serpTemp: 0, doorTemp: 0, operationState: 1 }, // t=0, E=10
    { timestamp: new Date(now.getTime() + 3600 * 1000), energyInstant: 20, serpTemp: 0, doorTemp: 0, operationState: 1 }, // t=1h, E=20
    { timestamp: new Date(now.getTime() + 7200 * 1000), energyInstant: 5, serpTemp: 0, doorTemp: 0, operationState: 1 }, // t=2h, E=5
];

console.log("--- OLD LOGIC (Integration) ---");
const oldPoints = buildCyclePointsOld(testData);
oldPoints.forEach((p, i) => {
    console.log(`Point ${i}: Instant=${p.energyInstant}, Accumulated=${p.energyAccumulated.toFixed(2)}`);
});
// Expected Old:
// P0: Acc = 0 (loop starts i=0, but accumulation happens if i>0)
// P1: Acc = 0 + 10 * 1h = 10
// P2: Acc = 10 + 20 * 1h = 30

console.log("\n--- NEW LOGIC (Summation) ---");
const newPoints = buildCyclePointsNew(testData);
newPoints.forEach((p, i) => {
    console.log(`Point ${i}: Instant=${p.energyInstant}, Accumulated=${p.energyAccumulated.toFixed(2)}`);
});
// Expected New:
// P0: Acc = 10
// P1: Acc = 10 + 20 = 30
// P2: Acc = 30 + 5 = 35

console.log("\n--- VERIFICATION ---");
if (newPoints[2].energyAccumulated === 35) {
    console.log("SUCCESS: New logic correctly sums energy.");
} else {
    console.log("FAILURE: New logic did not sum correctly.");
}
