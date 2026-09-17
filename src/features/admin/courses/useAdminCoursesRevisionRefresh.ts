import { useEffect, useRef } from 'react';
import { registerAdminCoursesRevisionListener } from './adminCoursesRevisionCoordinator';

export function useAdminCoursesRevisionRefresh(refresh: () => void, enabled: boolean): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    return registerAdminCoursesRevisionListener(() => {
      refreshRef.current();
    });
  }, [enabled]);
}
