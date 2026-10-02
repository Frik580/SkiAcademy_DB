import { z } from 'zod';
import type { ResortConditions, ResortLocation } from '../model/conditions';

export const WEATHER_CACHE_MS = 10 * 60 * 1000;
const FAILURE_CACHE_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const optionalNumber = z.number().finite().nullable().optional();
const forecastSchema = z.object({
  current: z.object({
    time: z.number().finite(),
    temperature_2m: optionalNumber,
    apparent_temperature: optionalNumber,
    weather_code: optionalNumber,
    wind_speed_10m: optionalNumber,
    wind_gusts_10m: optionalNumber,
  }),
  hourly: z
    .object({
      time: z.array(z.number().finite()),
      snow_depth: z.array(z.number().finite().nullable()).optional(),
      visibility: z.array(z.number().finite().nullable()).optional(),
    })
    .optional(),
});

/** Explicit SI units and Unix timestamps keep current-hour selection independent of browser timezone. */
export function mapWeatherResponse(raw: unknown): ResortConditions {
  const { current, hourly } = forecastSchema.parse(raw);
  let hourIndex = -1;
  hourly?.time.forEach((time, index) => {
    if (time <= current.time && (hourIndex < 0 || time > hourly.time[hourIndex])) hourIndex = index;
  });
  const currentHour = hourIndex >= 0 && hourly && current.time - hourly.time[hourIndex] < 3600;
  const snowDepthM = currentHour ? (hourly.snow_depth?.[hourIndex] ?? null) : null;
  const visibilityM = currentHour ? (hourly.visibility?.[hourIndex] ?? null) : null;
  const data: ResortConditions = {
    temperatureC: current.temperature_2m ?? null,
    apparentTemperatureC: current.apparent_temperature ?? null,
    weatherCode: current.weather_code ?? null,
    windKmh: current.wind_speed_10m ?? null,
    windGustKmh: current.wind_gusts_10m ?? null,
    visibilityM: visibilityM !== null && visibilityM >= 0 ? visibilityM : null,
    snowDepthCm: snowDepthM !== null && snowDepthM >= 0 ? snowDepthM * 100 : null,
    updatedAt: new Date(current.time * 1000).toISOString(),
    liftsOpen: null,
    liftsTotal: null,
    trailsOpen: null,
  };
  if (
    [data.temperatureC, data.weatherCode, data.windKmh, data.visibilityM, data.snowDepthCm].every(
      (value) => value === null
    )
  ) {
    throw new Error('Weather response contains no conditions');
  }
  return data;
}

async function fetchWeather(location: ResortLocation): Promise<ResortConditions> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m',
    hourly: 'snow_depth,visibility',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    timeformat: 'unixtime',
    timezone: 'GMT',
    forecast_days: '1',
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
    return mapWeatherResponse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

interface CacheEntry {
  expiresAt: number;
  data?: ResortConditions;
  error?: Error;
  pending?: Promise<ResortConditions>;
}

/** Shared browser-session cache; no Firestore reads/writes or persisted synthetic operations data. */
export function createWeatherService(
  request: (location: ResortLocation) => Promise<ResortConditions> = fetchWeather,
  now: () => number = Date.now
) {
  const cache = new Map<string, CacheEntry>();
  return {
    get(location: ResortLocation, force = false): Promise<ResortConditions> {
      const key = `${location.latitude},${location.longitude}`;
      const existing = cache.get(key);
      if (existing?.pending) return existing.pending;
      if (!force && existing && existing.expiresAt > now()) {
        if (existing.data) return Promise.resolve(existing.data);
        if (existing.error) return Promise.reject(existing.error);
      }
      // Retain at most four completed locations; pending requests must stay available for deduplication.
      if (!existing && cache.size >= 4) {
        const oldest = [...cache].find(([, entry]) => !entry.pending);
        if (oldest) cache.delete(oldest[0]);
      }
      const entry: CacheEntry = { expiresAt: 0 };
      cache.set(key, entry);
      entry.pending = Promise.resolve()
        .then(() => request(location))
        .then(
          (data) => {
            entry.data = data;
            entry.expiresAt = now() + WEATHER_CACHE_MS;
            entry.pending = undefined;
            return data;
          },
          (cause: unknown) => {
            const error = cause instanceof Error ? cause : new Error('Weather unavailable');
            entry.error = error;
            entry.expiresAt = now() + FAILURE_CACHE_MS;
            entry.pending = undefined;
            throw error;
          }
        );
      return entry.pending;
    },
  };
}

export const weatherService = createWeatherService();
