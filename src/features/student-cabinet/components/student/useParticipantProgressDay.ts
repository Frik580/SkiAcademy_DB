import { useEffect, useState } from 'react';
import { participantProgressDayKey } from '@ski-academy/shared-domain';

// Find the next school-day boundary using the same timezone-aware calendar as progress.
function nextDayBoundary(now: number): number {
  const day = participantProgressDayKey(new Date(now));
  let low = now;
  let high = now + 48 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (participantProgressDayKey(new Date(middle)) === day) low = middle;
    else high = middle;
  }
  return high;
}

export function useParticipantProgressDay(): string {
  const [day, setDay] = useState(() => participantProgressDayKey(new Date()));

  useEffect(() => {
    let timer: number;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setDay(participantProgressDayKey(new Date(now)));
      timer = window.setTimeout(refresh, Math.max(1, nextDayBoundary(now) - now));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return day;
}
