import { useEffect } from 'react';
import { lockBodyScroll } from './bodyScrollLock';

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll();
  }, [active]);
}
