import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResortConditions } from '../../src/features/resort-conditions/hooks/useResortConditions';
import { weatherService } from '../../src/features/resort-conditions/api/weatherService';
import type { ResortConditions } from '../../src/features/resort-conditions';

const weather: ResortConditions = {
  temperatureC: -7,
  apparentTemperatureC: null,
  weatherCode: 0,
  windKmh: 9,
  windGustKmh: null,
  snowDepthCm: null,
  visibilityM: null,
  updatedAt: null,
  liftsOpen: null,
  liftsTotal: null,
  trailsOpen: null,
};
const location = { latitude: 43.1281, longitude: 77.0808 };
beforeEach(() => {
  vi.spyOn(weatherService, 'get').mockResolvedValue(weather);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useResortConditions', () => {
  it('waits for config readiness and avoids requests on unrelated renders', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useResortConditions(location, enabled),
      { initialProps: { enabled: false } }
    );
    expect(result.current.conditions.status).toBe('loading');
    expect(weatherService.get).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.conditions.data).toEqual(weather));
    rerender({ enabled: true });
    expect(weatherService.get).toHaveBeenCalledTimes(1);
  });

  it('turns rejected API requests into an error state without throwing', async () => {
    vi.mocked(weatherService.get).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useResortConditions(location, true));
    await waitFor(() => expect(result.current.conditions).toEqual({ status: 'error', data: null }));
  });

  it('ignores a late response for old coordinates', async () => {
    let resolveOld!: (data: ResortConditions) => void;
    vi.mocked(weatherService.get).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      })
    );
    const { result, rerender } = renderHook(
      ({ latitude }) => useResortConditions({ ...location, latitude }, true),
      { initialProps: { latitude: location.latitude } }
    );
    rerender({ latitude: 44 });
    await waitFor(() => expect(result.current.conditions.data).toEqual(weather));
    await act(async () => resolveOld({ ...weather, temperatureC: 99 }));
    expect(result.current.conditions.data?.temperatureC).toBe(-7);
  });

  it('clears weather after a failed manual refresh', async () => {
    const { result } = renderHook(() => useResortConditions(location, true));
    await waitFor(() => expect(result.current.conditions.status).toBe('ready'));
    vi.mocked(weatherService.get).mockRejectedValue(new Error('offline'));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.conditions).toEqual({ status: 'error', data: null }));
  });
});
