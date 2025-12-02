export type CycleLogicConfigDTO = {
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
};
