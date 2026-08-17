import { db, doc, getDoc, onSnapshot, setDoc } from '../../infrastructure/firebase';
import type { ResortConfig } from '../../types';

const resortConfigRef = doc(db, 'resort_data', 'config');
const resortCacheRef = doc(db, 'resort_data', 'cache');

export interface ResortWeatherCache {
  tempC: number;
  windKmh: number;
  weatherCode: number;
  snowDepthCm: number;
  newSnow24h: number;
  openLifts: number;
  lastUpdatedTimestamp: number;
  latitude: number;
  longitude: number;
}

export function subscribeResortConfig(
  onConfig: (config: ResortConfig | null) => void,
  onError: (error: Error) => void
) {
  return onSnapshot(
    resortConfigRef,
    (snapshot) => onConfig(snapshot.exists() ? (snapshot.data() as ResortConfig) : null),
    onError
  );
}

export async function saveResortConfig(update: Partial<ResortConfig>): Promise<void> {
  await setDoc(resortConfigRef, update, { merge: true });
}

export async function getResortWeatherCache(): Promise<ResortWeatherCache | null> {
  const snapshot = await getDoc(resortCacheRef);
  return snapshot.exists() ? (snapshot.data() as ResortWeatherCache) : null;
}

export async function saveResortWeatherCache(cache: ResortWeatherCache): Promise<void> {
  await setDoc(resortCacheRef, cache);
}
