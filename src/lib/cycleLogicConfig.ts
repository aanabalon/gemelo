import fs from 'fs/promises';
import path from 'path';

export interface CycleLogicConfig {
  minRiseDegrees: number;
  riseWindowMinutes: number;
  minSlope: number;
  slopeDurationMinutes: number;
  minDefrostTemperature: number;
  minDefrostSeparationMinutes: number;
  minCycleHours: number;
  maxCycleHours: number;
  operationStartValue: number;
  operationEndValue: number;
  cycleEnergySetPoint: number;
  minOperationZeroMinutesForEndReal: number;
}

const DEFAULT_CONFIG: CycleLogicConfig = {
  minRiseDegrees: 8,
  riseWindowMinutes: 30,
  minSlope: 0.25,
  slopeDurationMinutes: 10,
  minDefrostTemperature: -4,
  minDefrostSeparationMinutes: 10,
  minCycleHours: 18,
  maxCycleHours: 40,
  operationStartValue: 1,
  operationEndValue: 0,
  cycleEnergySetPoint: 0,
  minOperationZeroMinutesForEndReal: 15,
};

const CONFIG_PATH = path.join(process.cwd(), 'config', 'cycle-logic-config.json');

export async function readCycleLogicConfig(): Promise<CycleLogicConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    await writeCycleLogicConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

export async function writeCycleLogicConfig(
  config: Partial<CycleLogicConfig>
): Promise<CycleLogicConfig> {
  const merged = { ...DEFAULT_CONFIG, ...config };
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
