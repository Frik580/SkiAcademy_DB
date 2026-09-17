import { useEffect, useRef } from 'react';
import { registerAdminFinanceRevisionListener } from './adminFinanceRevisionCoordinator';

export function useAdminFinanceRevisionRefresh(refresh: () => void, enabled: boolean): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    return registerAdminFinanceRevisionListener(() => {
      refreshRef.current();
    });
  }, [enabled]);
}
