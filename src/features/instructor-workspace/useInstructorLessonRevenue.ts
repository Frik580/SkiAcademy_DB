import { useEffect, useState } from 'react';
import type { InstructorLessonRevenueState } from '@ski-academy/shared-domain';
import { subscribeInstructorLessonRevenue } from './instructorLessonRevenue';

export function useInstructorLessonRevenue(accountId: string, instructorId: string | undefined) {
  const key = `${accountId}:${instructorId ?? ''}`;
  const [read, setRead] = useState<{ key: string; state: InstructorLessonRevenueState }>({
    key,
    state: { status: 'loading' },
  });
  useEffect(() => {
    if (!instructorId) {
      setRead({ key, state: { status: 'unavailable' } });
      return;
    }
    let unsubscribe: (() => void) | undefined;
    const start = () => {
      unsubscribe?.();
      unsubscribe = subscribeInstructorLessonRevenue((state) => setRead({ key, state }));
    };
    start();
    // Re-authorize account/session assignments when returning to the cabinet.
    window.addEventListener('focus', start);
    return () => {
      window.removeEventListener('focus', start);
      unsubscribe?.();
    };
  }, [key, instructorId]);
  return read.key === key ? read.state : { status: 'loading' as const };
}
