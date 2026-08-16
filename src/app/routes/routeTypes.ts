import type { ResortConfig } from '../../types';

export interface ResortData {
  resortConfig: ResortConfig;
  tempC: number;
  snowDepthCm: number;
  newSnow24h: number;
  windKmh: number;
  weatherCode: number;
  openLifts: number;
  isFahrenheit: boolean;
  isResortLoading: boolean;
  lastUpdated: string;
}

export interface AppRoutesProps {
  resortData: ResortData;
  setIsFahrenheit: (value: boolean) => void;
  onRefreshResortStats: () => void;
  onSignOut: () => void;
}
