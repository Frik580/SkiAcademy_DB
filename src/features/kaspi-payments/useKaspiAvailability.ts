import { useCallback, useEffect, useRef, useState } from 'react';
import type { KaspiConfigurationInput } from './kaspiContracts';
import { kaspiConfiguration } from './kaspiService';

type Availability =
  | { status: 'loading' | 'disabled' | 'error'; configuration?: undefined }
  | { status: 'enabled'; configuration: KaspiConfigurationInput };

// Configuration is a server projection, never a cached permission to start payment.
export function useKaspiAvailability(scope: string) {
  const [state, setState] = useState<{ scope: string; value: Availability }>({
    scope,
    value: { status: 'loading' },
  });
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setState({ scope, value: { status: 'loading' } });
    let value: Availability;
    try {
      const configuration = await kaspiConfiguration();
      value = configuration.enabled ? { status: 'enabled', configuration } : { status: 'disabled' };
    } catch {
      value = { status: 'error' };
    }
    if (current === generation.current) setState({ scope, value });
  }, [scope]);

  useEffect(() => {
    const requests = generation;
    const reload = () => void refresh();
    const visibility = () => {
      if (document.visibilityState === 'visible') reload();
      else {
        ++requests.current;
        setState({ scope, value: { status: 'loading' } });
      }
    };
    void refresh();
    window.addEventListener('focus', reload);
    window.addEventListener('kaspi-configuration-changed', reload);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      ++requests.current;
      window.removeEventListener('focus', reload);
      window.removeEventListener('kaspi-configuration-changed', reload);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [refresh, scope]);

  return {
    ...(state.scope === scope ? state.value : { status: 'loading' as const }),
    refresh,
  };
}
