import { db, doc, getDoc, onSnapshot, setDoc } from '../../infrastructure/firebase';
import type { ResortConfig } from '../../types';

const resortConfigRef = doc(db, 'resort_data', 'config');
const resortCacheRef = doc(db, 'resort_data', 'cache');
const RESORT_CONFIG_STORAGE_KEY = 'alpine_glide_resort_config';

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

/** Last known Firestore resort config — avoids painting DEFAULT hero before the first snapshot. */
export function readCachedResortConfig(): ResortConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RESORT_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResortConfig>;
    if (typeof parsed?.latitude !== 'number' || typeof parsed?.longitude !== 'number') {
      return null;
    }
    return parsed as ResortConfig;
  } catch {
    return null;
  }
}

export function writeCachedResortConfig(config: ResortConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RESORT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota / private mode
  }
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
