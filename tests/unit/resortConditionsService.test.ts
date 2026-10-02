import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWeatherService,
  mapWeatherResponse,
  WEATHER_CACHE_MS,
} from '../../src/features/resort-conditions/api/weatherService';
import {
  temperatureValue,
  visibilityKey,
  weatherConditionKey,
} from '../../src/features/resort-conditions/model/presentation';

const location = { latitude: 43.1281, longitude: 77.0808 };
const hour = 1790935200;
const forecast = () => ({
  current: {
    time: hour + 900,
    temperature_2m: -7,
    apparent_temperature: -11,
    weather_code: 0,
    wind_speed_10m: 9,
    wind_gusts_10m: 18,
  },
  hourly: {
    time: [hour - 3600, hour, hour + 3600],
    snow_depth: [0.12, 0.42, 0.5],
    visibility: [100, 9840, 12000],
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resort conditions provider', () => {
  it('selects the current hour instead of midnight and converts metres to centimetres', () => {
    expect(mapWeatherResponse(forecast())).toEqual({
      temperatureC: -7,
      apparentTemperatureC: -11,
      weatherCode: 0,
      windKmh: 9,
      windGustKmh: 18,
      visibilityM: 9840,
      snowDepthCm: 42,
      updatedAt: new Date((hour + 900) * 1000).toISOString(),
      liftsOpen: null,
      liftsTotal: null,
      trailsOpen: null,
    });
  });

  it('keeps missing fields null and real zero values intact', () => {
    const data = mapWeatherResponse({ current: { time: hour, temperature_2m: 0 } });
    expect(data.temperatureC).toBe(0);
    expect(data.snowDepthCm).toBeNull();
    expect(data.visibilityM).toBeNull();
    expect(data.weatherCode).toBeNull();
  });

  it('rejects empty/malformed responses without fabricating data', () => {
    expect(() => mapWeatherResponse({ current: { time: hour } })).toThrow();
    expect(() => mapWeatherResponse({ current: { time: hour, temperature_2m: 'cold' } })).toThrow();
    expect(() => mapWeatherResponse({})).toThrow();
  });

  it('does not reuse stale hourly samples or negative snow/visibility', () => {
    const raw = forecast();
    raw.hourly.time = [hour - 7200];
    expect(mapWeatherResponse(raw).snowDepthCm).toBeNull();
    raw.hourly.time = [hour];
    raw.hourly.snow_depth = [-1];
    raw.hourly.visibility = [-1];
    expect(mapWeatherResponse(raw).snowDepthCm).toBeNull();
    expect(mapWeatherResponse(raw).visibilityM).toBeNull();
  });

  it('requests explicit units, bounded hourly data and handles HTTP errors', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => forecast() });
    vi.stubGlobal('fetch', fetch);
    await createWeatherService().get(location);
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.searchParams.get('temperature_unit')).toBe('celsius');
    expect(url.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(url.searchParams.get('hourly')).toBe('snow_depth,visibility');
    expect(url.searchParams.get('forecast_days')).toBe('1');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(createWeatherService().get(location)).rejects.toThrow('503');
  });

  it('aborts a stalled request after ten seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          })
      )
    );
    const pending = createWeatherService().get(location);
    const assertion = expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });
});

describe('shared weather cache', () => {
  it('deduplicates concurrent requests, caches remounts, expires and supports refresh', async () => {
    let now = 0;
    const request = vi.fn(async () => mapWeatherResponse(forecast()));
    const service = createWeatherService(request, () => now);
    const a = service.get(location);
    expect(service.get(location)).toBe(a);
    await a;
    await service.get(location);
    expect(request).toHaveBeenCalledTimes(1);
    now = WEATHER_CACHE_MS;
    await service.get(location);
    expect(request).toHaveBeenCalledTimes(2);
    await service.get(location, true);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('keys by coordinates and bounds completed locations to four', async () => {
    const request = vi.fn(async () => mapWeatherResponse(forecast()));
    const service = createWeatherService(request);
    for (let latitude = 40; latitude < 45; latitude++)
      await service.get({ latitude, longitude: 77 });
    await service.get({ latitude: 44, longitude: 77 });
    expect(request).toHaveBeenCalledTimes(5);
    await service.get({ latitude: 40, longitude: 77 });
    expect(request).toHaveBeenCalledTimes(6);
  });

  it('backs off failures and retries after thirty seconds', async () => {
    let now = 0;
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(mapWeatherResponse(forecast()));
    const service = createWeatherService(request, () => now);
    await expect(service.get(location)).rejects.toThrow('offline');
    await expect(service.get(location)).rejects.toThrow('offline');
    expect(request).toHaveBeenCalledTimes(1);
    now = 30000;
    await expect(service.get(location)).resolves.toHaveProperty('temperatureC', -7);
  });
});

describe('presentation mappers', () => {
  it.each([
    [0, 'conditionsClear'],
    [1, 'conditionsClear'],
    [3, 'weatherCloudy'],
    [48, 'weatherFog'],
    [61, 'weatherRain'],
    [75, 'weatherSnow'],
    [95, 'weatherThunderstorm'],
    [999, null],
    [null, null],
  ])('maps weather code %s', (code, key) => {
    expect(weatherConditionKey(code as number | null)).toBe(key);
  });

  it.each([
    [10000, 'conditionsVisibilityExcellent'],
    [9999, 'conditionsVisibilityGood'],
    [5000, 'conditionsVisibilityGood'],
    [4999, 'conditionsVisibilityModerate'],
    [1000, 'conditionsVisibilityModerate'],
    [999, 'conditionsVisibilityPoor'],
    [0, 'conditionsVisibilityPoor'],
    [null, null],
    [-1, null],
  ])('maps visibility %s', (metres, key) => {
    expect(visibilityKey(metres as number | null)).toBe(key);
  });

  it('converts Celsius to Fahrenheit before rounding', () => {
    expect(temperatureValue(-7, 'fahrenheit')).toBe(19);
    expect(temperatureValue(-40, 'fahrenheit')).toBe(-40);
    expect(temperatureValue(0, 'fahrenheit')).toBe(32);
    expect(temperatureValue(2.4, 'celsius')).toBe(2);
  });
});
