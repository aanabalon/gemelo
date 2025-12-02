export type DerivedValuePoint = { timestamp: string; value: number };

export type DerivedConfigResponse = {
  name: string;
  points: DerivedValuePoint[];
};

export type RawDataPoint = {
  timestamp: string;
  [key: string]: number | string | null | undefined;
};
