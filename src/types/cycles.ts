export type CyclePointDTO = {
  timestamp: string;
  promedioSerpentin?: number | null;
  promedioPuerta?: number | null;
  operacion?: number | null;
  energiaAcumulada?: number | null;
  avgSerpentin?: number | null;
  avgPuerta?: number | null;
  operationState?: number | null;
  energyAccumulated?: number | null;
  time?: string;
};

export type CycleDTO = {
  id: string | number;
  start?: string | null;
  end?: string | null;
  endReal?: string | null;
  endEstimated?: string | null;
  duracionCicloHoras?: number | null;
  sobrecongelamientoHoras?: number | null;
  dischargeTime?: string | null;
  energyAccumulatedTotal?: number | null;
  activeTimeMinutes?: number | null;
  overfrozenTimeMinutes?: number | null;
  setPoint?: number | null;
  points?: CyclePointDTO[];
  isCurrent?: boolean;
  displayIndex?: number;
};

export type DerivedValueSeries = {
  name: string;
  points: { timestamp: string; value: number }[];
};

export type CycleListItem = {
  id: string | number;
  isCurrent?: boolean;
  displayIndex?: number;
};
