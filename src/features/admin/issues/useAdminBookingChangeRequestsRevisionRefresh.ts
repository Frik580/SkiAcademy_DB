import { useEffect, useRef } from 'react';
import { registerAdminBookingChangeRequestsRevisionListener } from './adminBookingChangeRequestsRevisionCoordinator';

export function useAdminBookingChangeRequestsRevisionRefresh(
  refresh: () => void,
  enabled: boolean
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    return registerAdminBookingChangeRequestsRevisionListener(() => {
      refreshRef.current();
    });
  }, [enabled]);
}
