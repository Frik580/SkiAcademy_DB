import type { ResortConfig } from '../../types';
import type {
  ResortConditionsState,
  ResortConditionsPresentation,
} from '../../features/resort-conditions';

export interface ResortData {
  resortConfig: ResortConfig;
  /** False until first Firestore snapshot (or local cache hydrate) for resort config. */
  isResortConfigReady: boolean;
  conditions: ResortConditionsState;
  presentation: ResortConditionsPresentation;
  tempC: number | null;
  snowDepthCm: number | null;
  newSnow24h: number | null;
  windKmh: number | null;
  weatherCode: number | null;
  openLifts: number | null;
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
