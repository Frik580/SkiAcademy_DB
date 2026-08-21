import type { ResortConfig } from '../../types';

export interface ResortData {
  resortConfig: ResortConfig;
  /** False until first Firestore snapshot (or local cache hydrate) for resort config. */
  isResortConfigReady: boolean;
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
