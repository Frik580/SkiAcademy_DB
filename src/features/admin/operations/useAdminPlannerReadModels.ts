import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminPlannerReadModel } from '@ski-academy/shared-domain';
import { queryAdminPlannerReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { toFunctionsClientError } from '../../../lib/functions/functionsClient';
import { resolveAdminTimeZone } from './adminTimeZone';
import type { ScheduleViewMode } from '../components/schedule/ScheduleToolbar';

export type AdminPlannerReadError = 'permission-denied' | 'read-failed';

export function useAdminPlannerReadModels(input: {
  readonly enabled: boolean;
  readonly localDate: string;
  readonly view: ScheduleViewMode;
  readonly windowDays?: number;
}) {
  const [item, setItem] = useState<AdminPlannerReadModel | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminPlannerReadError | undefined>();
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!input.enabled) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await queryAdminPlannerReadModels({
        scope: 'admin_planner',
        localDate: input.localDate,
        view: input.view,
        timeZone: resolveAdminTimeZone(),
        ...(input.windowDays === undefined ? {} : { windowDays: input.windowDays }),
      });
      if (requestId !== requestIdRef.current) return;
      setItem(result.item);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(
        toFunctionsClientError(caught).code === 'functions/permission-denied'
          ? 'permission-denied'
          : 'read-failed'
      );
      setItem(undefined);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [input.enabled, input.localDate, input.view, input.windowDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { item, loading, error, refresh };
}
