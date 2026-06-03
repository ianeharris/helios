export interface FoxEssLive {
  deviceSN: string;
  pvPower: number;    // kW — solar generation
  batSoc: number;     // % — battery state of charge
  batPower: number;   // kW — positive = charging, negative = discharging
  gridPower: number;  // kW — positive = importing from grid, negative = exporting
  loadsPower: number; // kW — home consumption
  updatedAt: string;  // ISO8601 UTC
}

export interface EnergyHistoryPoint {
  time: string;          // ISO8601 bucket start
  pvWatts: number | null;
  battSocPct: number | null;
  battWatts: number | null;
  gridWatts: number | null;
  loadWatts: number | null;
}

export type EnergyPeriod = 'day' | 'week' | 'month';

export interface EnergyHistory {
  period: EnergyPeriod;
  points: EnergyHistoryPoint[];
}
