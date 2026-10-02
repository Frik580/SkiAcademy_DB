import { useCallback, useEffect, useState } from 'react';
import { WEATHER_CACHE_MS, weatherService } from '../api/weatherService';
import type { ResortConditionsState, ResortLocation } from '../model/conditions';

const loading: ResortConditionsState = { status: 'loading', data: null };

/** The shell owns the weather read; presentational surfaces consume its shared snapshot. */
export function useResortConditions({ latitude, longitude }: ResortLocation, enabled: boolean) {
  const [snapshot, setSnapshot] = useState({ key: '', state: loading });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const key = `${latitude},${longitude}`;
  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void weatherService.get({ latitude, longitude }, refreshVersion > 0).then(
      (data) => {
        if (active) setSnapshot({ key, state: { status: 'ready', data } });
      },
      () => {
        if (active) setSnapshot({ key, state: { status: 'error', data: null } });
      }
    );
    return () => {
      active = false;
    };
  }, [latitude, longitude, key, enabled, refreshVersion]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, WEATHER_CACHE_MS);
    return () => clearInterval(interval);
  }, [enabled, refresh]);

  return { conditions: enabled && snapshot.key === key ? snapshot.state : loading, refresh };
}
