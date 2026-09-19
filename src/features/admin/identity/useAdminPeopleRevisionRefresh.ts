import { useEffect, useRef } from 'react';
import { registerAdminPeopleRevisionListener } from './adminPeopleRevisionCoordinator';

export function useAdminPeopleRevisionRefresh(refresh: () => void, enabled: boolean): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    return registerAdminPeopleRevisionListener(() => {
      refreshRef.current();
    });
  }, [enabled]);
}
